"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

function buildHref(keyword: string) {
  const trimmed = keyword.trim();
  if (!trimmed) return "/platform/identity-diagnostics";
  const query = new URLSearchParams({ keyword: trimmed });
  return `/platform/identity-diagnostics?${query.toString()}`;
}

export function IdentityDiagnosticsSearch({ keyword }: { keyword: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(keyword);

  useEffect(() => {
    setValue(keyword);
  }, [keyword]);

  function navigate(nextKeyword: string) {
    startTransition(() => {
      router.push(buildHref(nextKeyword));
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(value);
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="identity-diagnostics-keyword">
            手机号 / openid / user_id
          </FieldLabel>
          <div className="grid gap-3 md:grid-cols-[1fr_88px]">
            <InputGroup>
              <InputGroupAddon>
                <Search data-icon="inline-start" />
              </InputGroupAddon>
              <InputGroupInput
                id="identity-diagnostics-keyword"
                value={value}
                disabled={pending}
                placeholder="输入 11 位手机号、微信 openid 或 auth user_id"
                onChange={(event) => setValue(event.target.value)}
              />
              {value ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="button"
                    size="icon-xs"
                    disabled={pending}
                    aria-label="清空关键词"
                    onClick={() => {
                      setValue("");
                      navigate("");
                    }}
                  >
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            <Button type="submit" disabled={pending || !value.trim()}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              排查
            </Button>
          </div>
          <FieldDescription>
            只读排查，不会修改微信绑定、业务身份或旧字段数据。
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
