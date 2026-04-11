import { BaseController } from "@/controllers/BaseController";
import {
  CreatePropertySchema,
  UpdatePropertySchema,
} from "@/schema/properties";
import { SupabaseDB } from "@/utils/supabase/index";
import type { FastifyInstance } from "fastify";
// import type { Tables, Inserts, Updates } from "@/types/db";

class PropertyController extends BaseController<
  typeof CreatePropertySchema,
  typeof UpdatePropertySchema
> {
  constructor() {
    super("properties", CreatePropertySchema, UpdatePropertySchema);
  }
}

export default new PropertyController();
