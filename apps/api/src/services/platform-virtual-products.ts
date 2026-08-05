import { Errors } from '../errors/error-factory';
import {
  platformVirtualProductsRepository,
  type PlatformVirtualProductTransitionStatus,
} from '../repositories/platform-virtual-products';
import type {
  CreatePlatformVirtualProductInput,
  PlatformVirtualProductListQueryInput,
  PlatformVirtualProductVersionCommandInput,
  UpdatePlatformVirtualProductInput,
} from '../schema/platform-virtual-products';
import { accessPolicyService } from './access-policy';
import type { AuthContext } from './authorization';

const READ = 'platform.virtual_product.read';
const MANAGE = 'platform.virtual_product.manage';

type PlatformVirtualProductDetail = {
  id: string;
  version: number;
  status?: string;
  mappings?: Array<{
    validation_status?: string | null;
    synced_product_version?: number | null;
    channel?: { environment?: string | null } | null;
  }>;
};

export type PlatformVirtualProductsServiceDependencies = {
  repository?: Pick<
    typeof platformVirtualProductsRepository,
    | 'list'
    | 'getDetail'
    | 'create'
    | 'update'
    | 'transition'
    | 'isUsablePlatformFile'
  >;
  accessPolicy?: Pick<typeof accessPolicyService, 'assertPermission'>;
};

export class PlatformVirtualProductsService {
  private readonly repository: NonNullable<
    PlatformVirtualProductsServiceDependencies['repository']
  >;
  private readonly accessPolicy: NonNullable<
    PlatformVirtualProductsServiceDependencies['accessPolicy']
  >;

  constructor(dependencies: PlatformVirtualProductsServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformVirtualProductsRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
  }

  async list(auth: AuthContext, query: PlatformVirtualProductListQueryInput) {
    this.assertPlatform(auth, READ);
    const { rows, total } = await this.repository.list(query);
    return {
      list: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async getDetail(auth: AuthContext, id: string) {
    this.assertPlatform(auth, READ);
    const product = await this.repository.getDetail(id);
    if (!product) {
      throw Errors.business(404, '虚拟商品不存在', 'VIRTUAL_PRODUCT_NOT_FOUND');
    }
    return product;
  }

  async create(auth: AuthContext, input: CreatePlatformVirtualProductInput) {
    this.assertPlatform(auth, MANAGE);
    await this.assertImageUsable(input.image_file_id);
    return this.repository.create({
      product: input,
      actorEmployeeId: requireActor(auth),
    });
  }

  async update(
    auth: AuthContext,
    id: string,
    input: UpdatePlatformVirtualProductInput,
  ) {
    this.assertPlatform(auth, MANAGE);
    if (input.image_file_id) {
      await this.assertImageUsable(input.image_file_id);
    }
    return this.repository.update({
      id,
      product: input,
      actorEmployeeId: requireActor(auth),
    });
  }

  async activate(
    auth: AuthContext,
    id: string,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    this.assertPlatform(auth, MANAGE);
    const product = await this.loadDetail(id);
    const production = product.mappings?.find(
      (item) => item.channel?.environment === 'production',
    );
    if (
      !production ||
      production.validation_status !== 'valid' ||
      production.synced_product_version !== product.version
    ) {
      throw Errors.business(
        409,
        '生产微信商品尚未完成同步校验',
        'VIRTUAL_PRODUCT_NOT_READY',
      );
    }
    return this.transition(auth, id, input, 'active');
  }

  async suspend(
    auth: AuthContext,
    id: string,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    this.assertPlatform(auth, MANAGE);
    const product = await this.loadDetail(id);
    if (product.status !== 'active') {
      throw Errors.business(
        409,
        '只有启用中的虚拟商品可以暂停',
        'VIRTUAL_PRODUCT_TRANSITION_INVALID',
      );
    }
    return this.transition(auth, id, input, 'suspended');
  }

  async archive(
    auth: AuthContext,
    id: string,
    input: PlatformVirtualProductVersionCommandInput,
  ) {
    this.assertPlatform(auth, MANAGE);
    await this.loadDetail(id);
    return this.transition(auth, id, input, 'archived');
  }

  private async transition(
    auth: AuthContext,
    id: string,
    input: PlatformVirtualProductVersionCommandInput,
    targetStatus: PlatformVirtualProductTransitionStatus,
  ) {
    return this.repository.transition({
      id,
      expectedVersion: input.version,
      targetStatus,
      actorEmployeeId: requireActor(auth),
    });
  }

  private async loadDetail(id: string): Promise<PlatformVirtualProductDetail> {
    const product = await this.repository.getDetail(id);
    if (!product) {
      throw Errors.business(404, '虚拟商品不存在', 'VIRTUAL_PRODUCT_NOT_FOUND');
    }
    return product as PlatformVirtualProductDetail;
  }

  private async assertImageUsable(fileId: string) {
    const usable = await this.repository.isUsablePlatformFile(fileId);
    if (!usable) {
      throw Errors.business(
        400,
        '虚拟商品图片不存在或不可用',
        'VIRTUAL_PRODUCT_IMAGE_INVALID',
      );
    }
  }

  private assertPlatform(auth: AuthContext, permission: string) {
    const isPlatformIdentity = auth.isPlatformStaff || auth.isPlatformAdmin;
    if (auth.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(auth, permission);
  }
}

function requireActor(auth: AuthContext): string {
  if (!auth.employeeId) {
    throw Errors.business(403, '缺少员工身份', 'PLATFORM_EMPLOYEE_REQUIRED');
  }
  return auth.employeeId;
}

export const platformVirtualProductsService =
  new PlatformVirtualProductsService();
