import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  customerPropertyRepository,
  type CustomerPrimaryPropertySummary,
  type CustomerPropertyAccessCustomer,
  type CustomerPropertySummary,
  type NormalizedCustomerPropertyPayload,
} from "@/repositories/customer-properties";
import type {
  CreateCustomerPropertyInput,
  UpdateCustomerPropertyInput,
} from "@/schema/properties";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { propertyLocationService } from "@/services/property-location";
import type { PropertyLocationStatus } from "@gooes/domain";

export type SerializedPropertySummary = CustomerPrimaryPropertySummary & {
  is_primary: boolean;
};

export type CustomerPropertySummaryBundle = {
  property_count: number;
  property_id: string | null;
  primary_property_id: string | null;
  primary_property: SerializedPropertySummary | null;
  property: SerializedPropertySummary | null;
  properties: SerializedPropertySummary[];
  community: string | null;
  building_info: string | null;
  layout: string | null;
  area: number | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  location_status: PropertyLocationStatus | null;
};

class CustomerPropertyService {
  serializePropertySummary(
    property: CustomerPrimaryPropertySummary,
    primaryPropertyId: string | null,
  ) {
    return {
      ...property,
      is_primary: property.id === primaryPropertyId,
    };
  }

  private normalizePropertySummary(
    property: CustomerPropertySummary,
  ): CustomerPrimaryPropertySummary {
    return {
      id: property.id,
      community: property.community,
      building_info: property.building_info,
      layout: property.layout,
      area: property.area,
      latitude: property.latitude,
      longitude: property.longitude,
      province: property.province,
      city: property.city,
      district: property.district,
      adcode: property.adcode,
      location_status: property.location_status,
      created_at: property.created_at,
    };
  }

  buildCustomerPropertySummaryBundle(
    customer: { id: string; property_id?: string | null },
    propertyMap: Map<string, CustomerPrimaryPropertySummary[]>,
  ): CustomerPropertySummaryBundle {
    const properties = propertyMap.get(customer.id) || [];
    const preferredPropertyId = customer.property_id ?? null;
    const primaryProperty = properties.find((item) => item.id === preferredPropertyId)
      || properties[0]
      || null;
    const primaryPropertyId = primaryProperty?.id ?? null;
    const serializedProperties = properties.map((item) =>
      this.serializePropertySummary(item, primaryPropertyId)
    );
    const serializedPrimaryProperty = primaryProperty
      ? this.serializePropertySummary(primaryProperty, primaryPropertyId)
      : null;

    return {
      property_count: properties.length,
      property_id: primaryPropertyId,
      primary_property_id: primaryPropertyId,
      primary_property: serializedPrimaryProperty,
      property: serializedPrimaryProperty,
      properties: serializedProperties,
      community: primaryProperty?.community ?? null,
      building_info: primaryProperty?.building_info ?? null,
      layout: primaryProperty?.layout ?? null,
      area: primaryProperty?.area ?? null,
      province: primaryProperty?.province ?? null,
      city: primaryProperty?.city ?? null,
      district: primaryProperty?.district ?? null,
      adcode: primaryProperty?.adcode ?? null,
      location_status: primaryProperty?.location_status ?? null,
    };
  }

  async getPrimaryCustomerPropertySummary(customerId: string, tenantId: string) {
    return customerPropertyRepository.getPrimarySummary({ customerId, tenantId });
  }

  async getCustomerPropertySummaryMap(customerIds: string[], tenantId: string) {
    const rows = await customerPropertyRepository.listSummariesByCustomerIds({
      customerIds,
      tenantId,
    });
    const summaryMap = new Map<string, CustomerPrimaryPropertySummary[]>();
    for (const item of rows) {
      if (!item.customer_id) {
        continue;
      }

      const summaries = summaryMap.get(item.customer_id) || [];
      summaries.push(this.normalizePropertySummary(item));
      summaryMap.set(item.customer_id, summaries);
    }

    return summaryMap;
  }

  async getCustomerPropertySummaries(customerId: string, tenantId: string) {
    return customerPropertyRepository.listSummariesByCustomer({ customerId, tenantId });
  }

  async upsertCustomerPrimaryProperty(input: {
    customerId: string;
    tenantId: string;
    propertyPayload: NormalizedCustomerPropertyPayload | undefined;
  }) {
    if (!input.propertyPayload) {
      return this.getPrimaryCustomerPropertySummary(input.customerId, input.tenantId);
    }

    const primaryProperty = await this.getPrimaryCustomerPropertySummary(
      input.customerId,
      input.tenantId,
    );
    const payload = await propertyLocationService.enrichPayload({
      tenantId: input.tenantId,
      payload: input.propertyPayload,
      existing: primaryProperty,
    });

    if (primaryProperty?.id) {
      await customerPropertyRepository.updateProperty({
        propertyId: primaryProperty.id,
        tenantId: input.tenantId,
        payload,
      });
    } else {
      await customerPropertyRepository.createPrimaryCandidate({
        customerId: input.customerId,
        tenantId: input.tenantId,
        payload,
      });
    }

    return this.getPrimaryCustomerPropertySummary(input.customerId, input.tenantId);
  }

  async listCustomerProperties(input: {
    authContext: AuthContext;
    customerId: string;
  }) {
    const customer = await this.getAccessibleCustomer(
      input.authContext,
      input.customerId,
      "customer.read",
    );
    const properties = await this.getCustomerPropertySummaries(
      customer.id,
      input.authContext.tenantId!,
    );

    return {
      list: properties.map((item) =>
        this.serializePropertySummary(item, customer.property_id)
      ),
      primary_property_id: customer.property_id,
    };
  }

  async createCustomerProperty(input: {
    authContext: AuthContext;
    customerId: string;
    payload: CreateCustomerPropertyInput;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await this.getAccessibleCustomer(
      input.authContext,
      input.customerId,
      "customer.update",
    );
    const payload = await propertyLocationService.enrichPayload({
      tenantId,
      payload: input.payload,
    });
    const property = await customerPropertyRepository.createProperty({
      customerId: customer.id,
      tenantId,
      payload,
    });
    const shouldSetAsPrimary = !customer.property_id || input.payload.set_as_primary;

    if (shouldSetAsPrimary) {
      await customerPropertyRepository.setPrimaryProperty({
        customerId: customer.id,
        propertyId: property.id,
        tenantId,
      });
    }

    return this.serializePropertySummary(
      property,
      shouldSetAsPrimary ? property.id : customer.property_id,
    );
  }

  async setCustomerPrimaryProperty(input: {
    authContext: AuthContext;
    customerId: string;
    propertyId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await this.getAccessibleCustomer(
      input.authContext,
      input.customerId,
      "customer.update",
    );
    await this.getRequiredCustomerPropertyRecord(customer.id, input.propertyId, tenantId);
    await customerPropertyRepository.setPrimaryProperty({
      customerId: customer.id,
      propertyId: input.propertyId,
      tenantId,
    });

    return {
      customer_id: customer.id,
      primary_property_id: input.propertyId,
    };
  }

  async updateCustomerProperty(input: {
    authContext: AuthContext;
    customerId: string;
    propertyId: string;
    payload: UpdateCustomerPropertyInput;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await this.getAccessibleCustomer(
      input.authContext,
      input.customerId,
      "customer.update",
    );
    const existing = await this.getRequiredCustomerPropertyRecord(
      customer.id,
      input.propertyId,
      tenantId,
    );

    if (Object.keys(input.payload).length === 0) {
      throw Errors.badRequest("至少需要提供一个待更新字段");
    }

    const payload = await propertyLocationService.enrichPayload({
      tenantId,
      payload: input.payload,
      existing,
    });
    const property = await customerPropertyRepository.updateProperty({
      propertyId: input.propertyId,
      tenantId,
      payload,
    });

    return this.serializePropertySummary(property, customer.property_id);
  }

  private async getAccessibleCustomer(
    authContext: AuthContext,
    customerId: string,
    permissionCode: "customer.read" | "customer.update",
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const customer = await customerPropertyRepository.findCustomerAccess({
      customerId,
      tenantId,
    });

    if (!customer) {
      throw Errors.business(404, "客户不存在", ErrorCodes.CUSTOMER_NOT_FOUND);
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      permissionCode,
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    return customer;
  }

  private async getRequiredCustomerPropertyRecord(
    customerId: string,
    propertyId: string,
    tenantId: string,
  ) {
    const property = await customerPropertyRepository.findCustomerProperty({
      customerId,
      propertyId,
      tenantId,
    });

    if (!property) {
      throw Errors.business(404, "房产不存在", ErrorCodes.PROPERTY_NOT_FOUND);
    }

    if (property.customer_id !== customerId) {
      throw Errors.business(
        400,
        "该房产不属于当前客户",
        ErrorCodes.PROPERTY_NOT_BELONG_TO_CUSTOMER,
      );
    }

    return property;
  }
}

export const customerPropertyService = new CustomerPropertyService();
export type {
  CustomerPrimaryPropertySummary,
  CustomerPropertyAccessCustomer,
  NormalizedCustomerPropertyPayload,
};
