import { TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export function ServiceReadonlyBanner() {
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>只读宽限期</AlertTitle>
      <AlertDescription>
        当前企业服务处于只读宽限期。您可以查看现有数据，新增、编辑和删除操作暂不可用。
      </AlertDescription>
    </Alert>
  );
}
