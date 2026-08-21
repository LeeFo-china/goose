"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

import { formatServiceAccessDateTime } from "./service-access-display";
import { ServiceOrderList } from "./service-order-list";
import { ServiceProductList } from "./service-product-list";
import {
  copyServicePurchaseLink,
  createServicePurchaseHandoffLifecycle,
  formatServicePurchaseError,
  getServicePurchaseLink,
  getServicePurchaseLinkRemainingMs,
  listServiceOrdersIfPermitted,
  listServiceProductsIfPermitted,
  type ServiceOrder,
  type ServiceProduct,
  type ServicePurchaseLink,
} from "./service-purchase-api";

export function ServicePurchaseSection({
  canPurchase,
  canReadOrders,
}: {
  canPurchase: boolean;
  canReadOrders: boolean;
}) {
  const [products, setProducts] = useState<ServiceProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(canPurchase);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(canReadOrders);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [purchaseLink, setPurchaseLink] = useState<ServicePurchaseLink | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const productRequestRef = useRef(0);
  const orderRequestRef = useRef(0);
  const canPurchaseRef = useRef(canPurchase);
  const purchaseLinkRef = useRef<ServicePurchaseLink | null>(null);
  const handoffLifecycleRef = useRef<{
    run: () => Promise<ServicePurchaseLink | null>;
    invalidate: () => void;
  } | null>(null);
  canPurchaseRef.current = canPurchase;

  const loadProducts = useCallback(async (): Promise<void> => {
    const requestId = productRequestRef.current + 1;
    productRequestRef.current = requestId;
    if (!canPurchase) {
      setProducts([]);
      setProductsLoading(false);
      setProductsError(null);
      return;
    }

    setProductsLoading(true);
    setProductsError(null);
    try {
      const result = await listServiceProductsIfPermitted(true);
      if (productRequestRef.current === requestId) {
        setProducts(result?.list ?? []);
      }
    } catch (error) {
      if (productRequestRef.current === requestId) {
        setProductsError(formatServicePurchaseError(
          error,
          "服务套餐加载失败，请稍后重试",
        ));
      }
    } finally {
      if (productRequestRef.current === requestId) {
        setProductsLoading(false);
      }
    }
  }, [canPurchase]);

  const loadOrders = useCallback(async (): Promise<void> => {
    const requestId = orderRequestRef.current + 1;
    orderRequestRef.current = requestId;
    if (!canReadOrders) {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersError(null);
      return;
    }

    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const result = await listServiceOrdersIfPermitted(true);
      if (orderRequestRef.current === requestId) {
        setOrders(result?.list ?? []);
      }
    } catch (error) {
      if (orderRequestRef.current === requestId) {
        setOrdersError(formatServicePurchaseError(
          error,
          "服务订单加载失败，请稍后重试",
        ));
      }
    } finally {
      if (orderRequestRef.current === requestId) setOrdersLoading(false);
    }
  }, [canReadOrders]);

  useEffect(() => {
    void loadProducts();
    return () => {
      productRequestRef.current += 1;
    };
  }, [loadProducts]);

  useEffect(() => {
    void loadOrders();
    return () => {
      orderRequestRef.current += 1;
    };
  }, [loadOrders]);

  if (!handoffLifecycleRef.current) {
    handoffLifecycleRef.current = createServicePurchaseHandoffLifecycle({
      requestLink: getServicePurchaseLink,
      isAuthorized: () => canPurchaseRef.current,
      retainResult: (result) => {
        purchaseLinkRef.current = result;
        setPurchaseLink(result);
      },
      navigate: (url) => window.location.assign(url),
      reportError: (error) => setPurchaseError(formatServicePurchaseError(
        error,
        "购买链接生成失败，请稍后重试",
      )),
    });
  }

  const clearPurchaseState = useCallback((): void => {
    purchaseLinkRef.current = null;
    setPurchaseLink(null);
    setPurchaseError(null);
    setCopyFeedback(null);
    setGenerating(false);
  }, []);

  useEffect(() => {
    const lifecycle = handoffLifecycleRef.current;
    canPurchaseRef.current = canPurchase;
    if (!canPurchase) {
      lifecycle?.invalidate();
      clearPurchaseState();
    }
    return () => {
      canPurchaseRef.current = false;
      lifecycle?.invalidate();
      purchaseLinkRef.current = null;
    };
  }, [canPurchase, clearPurchaseState]);

  useEffect(() => {
    if (!purchaseLink) return;
    const remainingMs = getServicePurchaseLinkRemainingMs(purchaseLink);
    const expireLink = () => {
      if (purchaseLinkRef.current !== purchaseLink) return;
      purchaseLinkRef.current = null;
      setPurchaseLink(null);
      setCopyFeedback("购买链接已过期，请重新生成");
    };
    if (remainingMs === 0) {
      expireLink();
      return;
    }
    const timer = window.setTimeout(expireLink, remainingMs);
    return () => window.clearTimeout(timer);
  }, [purchaseLink]);

  const handlePurchase = useCallback(async (): Promise<void> => {
    setGenerating(true);
    setPurchaseError(null);
    setCopyFeedback(null);
    try {
      await handoffLifecycleRef.current?.run();
    } finally {
      if (canPurchaseRef.current) setGenerating(false);
    }
  }, []);

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!purchaseLink) return;
    if (getServicePurchaseLinkRemainingMs(purchaseLink) === 0) {
      purchaseLinkRef.current = null;
      setPurchaseLink(null);
      setCopyFeedback("购买链接已过期，请重新生成");
      return;
    }
    try {
      await copyServicePurchaseLink(
        purchaseLink,
        (value) => navigator.clipboard.writeText(value),
      );
      setCopyFeedback("购买链接已复制");
    } catch {
      if (getServicePurchaseLinkRemainingMs(purchaseLink) === 0) {
        purchaseLinkRef.current = null;
        setPurchaseLink(null);
        setCopyFeedback("购买链接已过期，请重新生成");
      } else {
        setCopyFeedback("复制失败，请使用打开按钮重新进入小程序");
      }
    }
  }, [purchaseLink]);

  const title = canPurchase && canReadOrders
    ? "服务购买与订单"
    : canPurchase
      ? "购买正式服务"
      : "最近服务订单";

  return (
    <Card className="w-full shadow-none">
      <CardHeader>
        <h2 className="text-base font-semibold leading-none tracking-normal">
          {title}
        </h2>
        <CardDescription>
          {canPurchase
            ? "查看当前可售套餐，并前往微信小程序完成购买。"
            : "查看当前企业最近 20 条技术服务订单。"}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {canPurchase ? (
          <section aria-labelledby="service-products-title" className="flex flex-col gap-3">
            <div>
              <h3 id="service-products-title" className="text-sm font-medium">
                可购买套餐
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                套餐选择、条款确认和微信支付将在小程序内完成
              </p>
            </div>
            <ServiceProductList
              products={products}
              loading={productsLoading}
              error={productsError}
              onRetry={() => void loadProducts()}
            />
          </section>
        ) : null}

        {canPurchase && canReadOrders ? <Separator /> : null}

        {canReadOrders ? (
          <section aria-labelledby="service-orders-title" className="flex flex-col gap-3">
            <div>
              <h3 id="service-orders-title" className="text-sm font-medium">
                最近服务订单
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                仅显示当前企业最近 20 条订单。
              </p>
            </div>
            <ServiceOrderList
              orders={orders}
              loading={ordersLoading}
              error={ordersError}
              onRetry={() => void loadOrders()}
            />
          </section>
        ) : null}

        {canPurchase && purchaseError ? (
          <Alert variant="destructive">
            <AlertTitle>购买入口打开失败</AlertTitle>
            <AlertDescription>{purchaseError}</AlertDescription>
          </Alert>
        ) : null}

        {canPurchase && purchaseLink ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>小程序购买链接已生成</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <p>
                有效期至 {formatServiceAccessDateTime(purchaseLink.expires_at)}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
                <Copy data-icon="inline-start" aria-hidden="true" />
                复制链接
              </Button>
              {copyFeedback ? <p aria-live="polite">{copyFeedback}</p> : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {canPurchase && copyFeedback && !purchaseLink ? (
          <Alert>
            <AlertTitle>购买链接状态</AlertTitle>
            <AlertDescription aria-live="polite">
              {copyFeedback}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      {canPurchase ? (
        <CardFooter className="border-t bg-muted/10">
          <Button
            type="button"
            disabled={generating}
            aria-busy={generating}
            onClick={() => void handlePurchase()}
          >
            {generating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ExternalLink data-icon="inline-start" aria-hidden="true" />
            )}
            {generating ? "正在生成购买链接" : "打开微信小程序购买"}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
