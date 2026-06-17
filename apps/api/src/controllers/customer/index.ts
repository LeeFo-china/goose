import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  CustomerListQuerySchema,
} from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import { customerCoreService } from "@/services/customer-core";
import { customerOwnerAssignmentService } from "@/services/customer-owner-assignments";
import { customerPhonePrivacyService } from "@/services/customer-phone-privacy";
import { customerPropertyService } from "@/services/customer-properties";
import { customerSourceService } from "@/services/customer-sources";
import { customerWorkflowRuntimeService } from "@/services/customer-workflow-runtime";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";
import { ResponseHandler } from "@/utils/response";
import customerExtrasController from "./extras-controller";
import customerPropertiesController from "./properties-controller";
import {
  buildPagination,
  CustomerBaseController,
} from "./shared";

class CustomerController extends CustomerBaseController {
  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    customerPropertiesController.registerExtraRoutes(fastify);
    customerExtrasController.registerExtraRoutes(fastify);
  };

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const authContextMs = Date.now() - authContextStartedAt;
    const queryResult = CustomerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const listResult = await customerCoreService.listCustomers({
      authContext,
      query: queryResult.data,
    });
    if (queryResult.data.mode === "home" || queryResult.data.mode === "compact") {
      request.log.info(
        {
          requestId: request.id,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          authContextMs,
          timings: listResult.debugTimings ?? null,
        },
        "[customer-home-list] timings",
      );
      const phonePrivacyContext = queryResult.data.mode === "compact"
        ? await customerPhonePrivacyService.createPrivacyContext(authContext)
        : undefined;

      return ResponseHandler.success({
        list: listResult.rows.map((item) => {
          const customer = this.attachFollowUpSummary(item, listResult.followUpMap);
          return this.serializeCustomer({
            ...customer,
            latest_project: listResult.latestProjectMap.get(item.id) ?? null,
          }, phonePrivacyContext);
        }),
        pagination: buildPagination(
          listResult.page,
          listResult.pageSize,
          listResult.total,
        ),
      });
    }

    const customerIds = listResult.rows.map((item) => item.id);
    const [phonePrivacyContext, propertyMap, sourceSummaryMap] = await Promise.all([
      customerPhonePrivacyService.createPrivacyContext(authContext),
      customerPropertyService.getCustomerPropertySummaryMap(
        customerIds,
        authContext.tenantId,
      ),
      customerSourceService.getCustomerSourceSummaryMap({
        authContext,
        customerIds,
      }),
    ]);
    return ResponseHandler.success({
      list: listResult.rows.map((item) =>
        this.serializeCustomer(
          this.attachSourceSummary(
            this.attachPropertySummary(
              this.attachFollowUpSummary(item, listResult.followUpMap),
              propertyMap,
            ),
            sourceSummaryMap,
          ),
          phonePrivacyContext,
        )
      ),
      pagination: buildPagination(
        listResult.page,
        listResult.pageSize,
        listResult.total,
      ),
    });
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const customer = await customerCoreService.getCustomerDetail({
      authContext,
      customerId: idVerify.data.id,
      notFoundAs: "bad_request",
    });

    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(
        customer,
        {
          phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
            authContext,
          ),
          authContext,
          tenantId: authContext.tenantId,
        },
      ),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const scope = accessPolicyService.assertPermission(authContext, "customer.create");

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { customerPayload, propertyPayload } = this.splitCustomerPayload(result.data);
    const douyinScreenshotImages = this.validateDouyinScreenshotImagesInput(
      customerPayload.douyin_screenshot_images,
    );
    const payload = {
      ...customerPayload,
      owner_id: customerPayload.owner_id ?? authContext.employeeId ?? null,
      tenant_id: authContext.tenantId,
      douyin_screenshot_images: customerPayload.source === "douyin"
        ? douyinScreenshotImages
        : [],
    };
    if (payload.source === "douyin") {
      this.assertDouyinScreenshotRequired(payload.douyin_screenshot_images);
    }
    if (payload.status && payload.status !== "potential") {
      throw Errors.badRequest("新建客户只能使用潜在客户状态，后续状态请在详情页通过状态动作推进");
    }

    if (
      scope !== "all" &&
      payload.owner_id &&
      payload.owner_id !== authContext.employeeId
    ) {
      throw Errors.forbidden();
    }

    if (payload.owner_id) {
      await customerOwnerAssignmentService.assertActiveTenantOwner({
        ownerId: payload.owner_id,
        tenantId: authContext.tenantId,
      });
    }

    const customer = await customerCoreService.createCustomer(payload);
    const workflowRuntimeMetadata =
      await customerWorkflowRuntimeService.syncCustomerCreated({
        authContext,
        tenantId: authContext.tenantId,
        customerId: customer.id,
      });
    if (workflowRuntimeMetadata.instance_id && workflowRuntimeMetadata.definition_id) {
      await workflowSubjectStateService.syncFromRuntimeInstance({
        tenantId: authContext.tenantId,
        subjectType: "customer",
        subjectId: customer.id,
        definitionId: workflowRuntimeMetadata.definition_id,
        instanceId: workflowRuntimeMetadata.instance_id,
      });
    }
    const primaryProperty = await customerPropertyService.upsertCustomerPrimaryProperty({
      customerId: customer.id,
      propertyPayload,
      tenantId: authContext.tenantId,
    });
    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(customer, {
        primaryProperty,
        phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
          authContext,
        ),
        authContext,
        tenantId: authContext.tenantId,
      }),
    );
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const existing = await customerCoreService.getRequiredCustomerForUpdate({
      authContext,
      customerId: idVerify.data.id,
    });

    const { customerPayload, propertyPayload } = this.splitCustomerPayload(result.data);
    const payload = customerPayload;
    const sourceTouched = this.isObjectWithOwnKey(payload, "source");
    const screenshotTouched = this.isObjectWithOwnKey(
      payload,
      "douyin_screenshot_images",
    );
    const nextSource = sourceTouched
      ? payload.source ?? null
      : existing.source ?? null;
    const nextDouyinScreenshotImages = screenshotTouched
      ? this.validateDouyinScreenshotImagesInput(
        payload.douyin_screenshot_images,
      )
      : this.normalizeStoredDouyinScreenshotImages(
        existing.douyin_screenshot_images,
      );

    if (nextSource === "douyin") {
      if (sourceTouched || screenshotTouched) {
        this.assertDouyinScreenshotRequired(nextDouyinScreenshotImages);
      }

      if (screenshotTouched || nextDouyinScreenshotImages.length > 0) {
        payload.douyin_screenshot_images = nextDouyinScreenshotImages;
      }
    } else if (sourceTouched || screenshotTouched) {
      payload.douyin_screenshot_images = [];
    }

    const hasPropertyUpdate = propertyPayload !== undefined;
    const hasOwnerUpdate = payload.owner_id !== undefined;
    const ownerChanged = hasOwnerUpdate && payload.owner_id !== existing.owner_id;
    const hasNonOwnerUpdates = Object.keys(payload).some((key) => key !== "owner_id");

    if (hasNonOwnerUpdates || hasPropertyUpdate) {
      const canAccess = await accessPolicyService.canAccessCustomer(
        authContext,
        existing,
        "customer.update",
      );
      if (!canAccess) {
        throw Errors.forbidden();
      }
    }

    if (ownerChanged) {
      if (!payload.owner_id) {
        throw Errors.badRequest("目标负责人不能为空");
      }

      await customerOwnerAssignmentService.assertCanAssignSingleOwner({
        authContext,
        customer: existing,
        ownerId: payload.owner_id,
      });
    }

    const shouldPreparePropertyBeforeStatusTransition =
      payload.status === "designing" && propertyPayload !== undefined;
    const preparedPrimaryProperty = shouldPreparePropertyBeforeStatusTransition
      ? await customerPropertyService.upsertCustomerPrimaryProperty({
        customerId: idVerify.data.id,
        propertyPayload,
        tenantId: authContext.tenantId,
      })
      : undefined;

    const customer = await customerCoreService.updateCustomer({
      authContext,
      customerId: idVerify.data.id,
      payload,
    });
    if (ownerChanged && payload.owner_id) {
      await customerOwnerAssignmentService.syncWorkflowTasksAfterOwnerAssignment({
        customerId: customer.id,
        ownerId: payload.owner_id,
        tenantId: authContext.tenantId,
      });
    }

    const primaryProperty = preparedPrimaryProperty ??
      await customerPropertyService.upsertCustomerPrimaryProperty({
        customerId: customer.id,
        propertyPayload,
        tenantId: authContext.tenantId,
      });
    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(customer, {
        primaryProperty,
        phonePrivacyContext: await customerPhonePrivacyService.createPrivacyContext(
          authContext,
        ),
        authContext,
        tenantId: authContext.tenantId,
      }),
    );
  };
}

export default new CustomerController();
