import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  EmployeeProjectDetailBootstrapQuerySchema,
} from "@/schema/projects";
import { customerPhonePrivacyService } from "@/services/customer-phone-privacy";
import { employeeProjectDetailBootstrapService } from "@/services/employee-project-detail-bootstrap";
import { projectSer } from "@/services/projects";
import { Delete, Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { ProjectBaseController } from "./shared";

class ProjectStatusBootstrapController extends ProjectBaseController {
  @Delete("/projects/:id")
  async deleteProject(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectSer.deleteProjectForTenant({
      authContext,
      projectId: idVerify.data.id,
    });
    return ResponseHandler.success(data);
  }

  @Get("/projects/:id/construction-stages")
  async listProjectConstructionStages(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectSer.listProjectConstructionStagesForTenant({
      authContext,
      projectId: idVerify.data.id,
    });

    return ResponseHandler.success(data);
  }

  @Get("/projects/:id/employee-detail-bootstrap")
  async getEmployeeProjectDetailBootstrap(request: FastifyRequest) {
    const startedAt = Date.now();
    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const authContextMs = Date.now() - authContextStartedAt;
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const queryResult = EmployeeProjectDetailBootstrapQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await employeeProjectDetailBootstrapService.getBootstrap({
      authContext,
      projectId: idVerify.data.id,
      query: queryResult.data,
    });
    const serializeStartedAt = Date.now();
    const phonePrivacyContext =
      await customerPhonePrivacyService.createPrivacyContext(authContext);
    const logs = {
      list: data.logs.rows.map((item) => {
        const logId = typeof item.id === "string" ? item.id : "";
        return this.serializeProjectLogForBootstrap(
          item,
          data.logs.commentSummaries.get(logId),
        );
      }),
      pagination: data.logs.pagination,
    };
    const members = data.members.map((item) => this.serializeProjectMember(item));
    const payload = {
      project: await this.serializeProjectDetailItem(
        data.project,
        phonePrivacyContext,
        members,
      ),
      permissions: data.permissions,
      members,
      workflow_state: data.workflow_state,
      workflow_progress: data.workflow_progress,
      construction_stages: data.construction_stages,
      log_entry: data.log_entry,
      next_action: data.next_action,
      logs,
      ...(data.calendar
        ? {
          calendar: {
            project_id: idVerify.data.id,
            list: data.calendar.map((item) =>
              this.serializeProjectLogCalendarItem(item)
            ),
          },
        }
        : {}),
      ...(data.referral_summary !== undefined
        ? { referral_summary: data.referral_summary }
        : {}),
      ...(data.cameras_summary !== undefined
        ? { cameras_summary: data.cameras_summary }
        : {}),
      server_time: data.server_time,
      ...(data.partial_errors.length > 0
        ? { partial_errors: data.partial_errors }
        : {}),
    };
    const serializeMs = Date.now() - serializeStartedAt;
    const durationMs = Date.now() - startedAt;
    const timingLog = {
      event: "employee_project_detail_bootstrap_timing",
      project_id: idVerify.data.id,
      employee_id: authContext.employeeId ?? null,
      tenant_id: authContext.tenantId,
      include_calendar: queryResult.data.include_calendar,
      include_referral_summary: queryResult.data.include_referral_summary,
      include_cameras_summary: queryResult.data.include_cameras_summary,
      log_page_size: queryResult.data.log_page_size,
      duration_ms: durationMs,
      steps: {
        auth_context_ms: authContextMs,
        ...data.timings,
        serialize_ms: serializeMs,
      },
      partial_error_count: data.partial_errors.length,
    };
    if (durationMs > 1500) {
      request.log.warn(timingLog, "[employee-project-bootstrap] slow timing");
    } else {
      request.log.info(timingLog, "[employee-project-bootstrap] timing");
    }

    return ResponseHandler.success(payload);
  }

}

export default new ProjectStatusBootstrapController();
