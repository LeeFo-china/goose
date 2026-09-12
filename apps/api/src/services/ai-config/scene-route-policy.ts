import { Errors } from "@/errors/error-factory";
import type {
  AiModelRecord,
  AiSceneRouteRecord,
} from "@/repositories/ai-config";
import type { AiSystemSceneRecord } from "@/repositories/ai-system-scenes";
import type {
  AiSceneRoutePayload,
  UpdateAiSceneRoutePayload,
} from "@/schema/ai-config";

type SceneRouteRepositoryPort = {
  getModelById(id: string): Promise<AiModelRecord | null>;
  getSceneRouteById(id: string): Promise<AiSceneRouteRecord | null>;
};

type SceneRegistryRepositoryPort = {
  getByCode(code: string): Promise<AiSystemSceneRecord | null>;
};

export type PreparedAiSceneRouteCreate = AiSceneRoutePayload & {
  name: string;
  modality: AiSystemSceneRecord["modality"];
  primary_model_id: string | null;
  fallback_model_id: string | null;
};

export class AiSceneRoutePolicy {
  constructor(
    private readonly routeRepository: Partial<SceneRouteRepositoryPort>,
    private readonly sceneRepository: Partial<SceneRegistryRepositoryPort>,
  ) {}

  async prepareCreate(input: AiSceneRoutePayload): Promise<PreparedAiSceneRouteCreate> {
    const scene = await this.getScene(input.scene_code);
    if (scene.source === "legacy" || scene.status === "inactive" || !scene.allow_new_configuration) {
      throw Errors.business(400, "该 AI 场景不可新增配置", "AI_SCENE_NOT_CONFIGURABLE");
    }
    if (input.modality !== undefined && input.modality !== scene.modality) {
      throw Errors.business(400, "场景模态与系统注册信息不一致", "AI_SCENE_MODALITY_MISMATCH");
    }

    const prepared = {
      ...input,
      name: input.name ?? scene.name,
      modality: scene.modality,
      primary_model_id: input.primary_model_id ?? null,
      fallback_model_id: input.fallback_model_id ?? null,
    };
    await this.assertRouteModels(prepared, scene.required_input_modalities);
    return prepared;
  }

  async prepareUpdate(id: string, input: UpdateAiSceneRoutePayload): Promise<UpdateAiSceneRoutePayload> {
    const current = await this.requireRoute(id);
    if (input.expected_version !== current.version) throw this.staleVersionError();
    if (
      (input.scene_code !== undefined && input.scene_code !== current.scene_code)
      || (input.modality !== undefined && input.modality !== current.modality)
    ) {
      throw Errors.business(400, "场景编码和模态不可修改", "AI_SCENE_ROUTE_IDENTITY_IMMUTABLE");
    }

    const scene = await this.getScene(current.scene_code);
    if (scene.status === "inactive") throw Errors.business(400, "该 AI 场景不可配置", "AI_SCENE_NOT_CONFIGURABLE");
    const merged = {
      primary_model_id: Object.hasOwn(input, "primary_model_id")
        ? input.primary_model_id
        : current.primary_model_id,
      fallback_model_id: Object.hasOwn(input, "fallback_model_id")
        ? input.fallback_model_id
        : current.fallback_model_id,
      modality: current.modality,
    };
    await this.assertRouteModels(merged, scene.required_input_modalities);
    return input;
  }

  private async getScene(code: string): Promise<AiSystemSceneRecord> {
    const scene = await this.requireSceneMethod("getByCode").call(this.sceneRepository, code);
    if (!scene) {
      throw Errors.business(400, "AI 场景未登记或不可配置", "AI_SCENE_NOT_CONFIGURABLE");
    }
    return scene;
  }

  private async requireRoute(id: string): Promise<AiSceneRouteRecord> {
    const route = await this.requireRouteMethod("getSceneRouteById").call(this.routeRepository, id);
    if (!route) throw Errors.business(404, "AI 场景路由不存在", "AI_SCENE_ROUTE_NOT_FOUND");
    return route;
  }

  async assertRouteModels(input: {
    primary_model_id?: string | null;
    fallback_model_id?: string | null;
    modality: AiSystemSceneRecord["modality"];
  }, requiredInputs: string[] = []): Promise<void> {
    if (
      input.primary_model_id
      && input.fallback_model_id
      && input.primary_model_id === input.fallback_model_id
    ) {
      throw Errors.business(409, "主模型和备用模型不能相同", "AI_ROUTE_MODEL_DUPLICATED");
    }
    await Promise.all([
      input.primary_model_id ? this.assertRouteModel(input.primary_model_id, input.modality, requiredInputs) : null,
      input.fallback_model_id ? this.assertRouteModel(input.fallback_model_id, input.modality, requiredInputs) : null,
    ]);
  }

  private async assertRouteModel(
    modelId: string,
    modality: AiSystemSceneRecord["modality"],
    requiredInputs: string[],
  ): Promise<void> {
    const model = await this.requireRouteMethod("getModelById").call(this.routeRepository, modelId);
    if (!model) throw Errors.business(404, "AI 模型不存在", "AI_MODEL_NOT_FOUND");
    if (model.status !== "active") {
      throw Errors.business(409, "AI 模型已停用", "AI_MODEL_INACTIVE");
    }
    if (model.modality !== modality) {
      throw Errors.business(409, "AI 模型模态与场景路由不匹配", "AI_ROUTE_MODEL_MODALITY_MISMATCH");
    }
    if (!model.provider) {
      throw Errors.business(409, "AI 模型关联的供应商不存在", "AI_PROVIDER_NOT_FOUND");
    }
    if (model.provider.status !== "active") {
      throw Errors.business(409, "AI 供应商已停用", "AI_PROVIDER_INACTIVE");
    }
    if (requiredInputs.some(required => !model.input_modalities?.includes(required))) {
      throw Errors.business(409, "AI 模型输入模态不满足场景要求", "AI_ROUTE_MODEL_INPUT_MODALITY_MISMATCH");
    }
  }

  private staleVersionError() {
    return Errors.business(409, "配置版本已变化，请重新加载后再保存", "AI_CONFIG_VERSION_STALE");
  }

  private requireRouteMethod<K extends keyof SceneRouteRepositoryPort>(method: K): SceneRouteRepositoryPort[K] {
    const target = this.routeRepository[method];
    if (!target) throw Errors.business(500, "AI 配置仓储未配置", "AI_CONFIG_REPOSITORY_METHOD_MISSING");
    return target as SceneRouteRepositoryPort[K];
  }

  private requireSceneMethod<K extends keyof SceneRegistryRepositoryPort>(method: K): SceneRegistryRepositoryPort[K] {
    const target = this.sceneRepository[method];
    if (!target) throw Errors.business(500, "AI 场景仓储未配置", "AI_SCENE_REPOSITORY_METHOD_MISSING");
    return target as SceneRegistryRepositoryPort[K];
  }
}
