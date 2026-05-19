import type { PropertyListQuery } from "@/schema/properties";
import { Errors } from "@/errors/error-factory";
import { propertyRepository } from "@/repositories/properties";
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
} from "@/schema/properties";

class PropertyService {
  private async assertCustomerBelongsToTenant(input: {
    customerId: string | null | undefined;
    tenantId: string;
  }) {
    if (!input.customerId) {
      return;
    }

    const customer = await propertyRepository.findCustomerById({
      customerId: input.customerId,
      tenantId: input.tenantId,
    });
    if (!customer) {
      throw Errors.badRequest("客户不存在或不属于当前租户");
    }
  }

  async listProperties(params: PropertyListQuery, tenantId: string) {
    const { list, total } = await propertyRepository.list({
      ...params,
      tenantId,
    });

    return {
      list,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: total ? Math.ceil(total / params.pageSize) : 0,
      },
    };
  }

  async getProperty(input: {
    id: string;
    tenantId: string;
  }) {
    const property = await propertyRepository.findById(input);
    if (!property) {
      throw Errors.badRequest("房产不存在");
    }

    return property;
  }

  async createProperty(input: {
    tenantId: string;
    payload: CreatePropertyInput;
  }) {
    await this.assertCustomerBelongsToTenant({
      customerId: input.payload.customer_id,
      tenantId: input.tenantId,
    });

    return propertyRepository.create(input);
  }

  async updateProperty(input: {
    id: string;
    tenantId: string;
    payload: UpdatePropertyInput;
  }) {
    const { id: _bodyId, ...payload } = input.payload;
    await this.assertCustomerBelongsToTenant({
      customerId: payload.customer_id,
      tenantId: input.tenantId,
    });

    const property = await propertyRepository.update({
      id: input.id,
      tenantId: input.tenantId,
      payload,
    });
    if (!property) {
      throw Errors.badRequest("房产不存在或更新失败");
    }

    return property;
  }
}

export const propertySer = new PropertyService();
