import { z } from 'zod';
import {
  RenderingListQuerySchema,
  RenderingPublishedStyleListSchema,
  type RenderingPublishedStyle,
  type RenderingPublishedStyleList,
} from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import {
  customerRenderingCatalogRepository,
  type CustomerRenderingCatalogRepository,
} from '@/repositories/customer-rendering-catalog';
import type { JwtPayload } from '@/utils/jwt';
import {
  customerRenderingContextService,
  type CustomerRenderingActor,
  type CustomerRenderingContextService,
} from './context';

type Channel = CustomerRenderingActor['channel'];
type ContextService = Pick<CustomerRenderingContextService, 'resolveWechat' | 'resolveDouyin'>;
type CatalogRepository = Pick<CustomerRenderingCatalogRepository, 'list' | 'find'>;
const IdSchema = z.uuid('无效的素材 ID');

export class CustomerRenderingCatalogService {
  private readonly contextService: ContextService;
  private readonly repository: CatalogRepository;

  constructor(dependencies: {
    readonly contextService?: ContextService;
    readonly repository?: CatalogRepository;
  } = {}) {
    this.contextService = dependencies.contextService ?? customerRenderingContextService;
    this.repository = dependencies.repository ?? customerRenderingCatalogRepository;
  }

  async listStyles(user: JwtPayload | undefined, channel: Channel, input: unknown): Promise<RenderingPublishedStyleList> {
    const actor = await this.resolveActor(user, channel);
    const parsed = RenderingListQuerySchema.safeParse(input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const { rows, total } = await this.repository.list(actor.tenantId, parsed.data);
    const result = {
      list: rows,
      pagination: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total,
        totalPages: Math.ceil(total / parsed.data.pageSize),
      },
    };
    const checked = RenderingPublishedStyleListSchema.safeParse(result);
    if (!checked.success) throw Errors.dbError('公开装修效果素材分页数据格式异常');
    return checked.data;
  }

  async getStyle(user: JwtPayload | undefined, channel: Channel, idInput: string): Promise<RenderingPublishedStyle> {
    const actor = await this.resolveActor(user, channel);
    const parsed = IdSchema.safeParse(idInput);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const style = await this.repository.find(actor.tenantId, parsed.data);
    if (!style) throw Errors.business(404, '装修效果素材不存在', 'RENDERING_STYLE_NOT_FOUND');
    return style;
  }

  private resolveActor(user: JwtPayload | undefined, channel: Channel) {
    return channel === 'wechat'
      ? this.contextService.resolveWechat(user)
      : this.contextService.resolveDouyin(user);
  }
}

export const customerRenderingCatalogService = new CustomerRenderingCatalogService();
