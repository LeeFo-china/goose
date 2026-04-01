import { BaseController } from "@/controllers/BaseController";
import { CreatePostSchema, UpdatePostSchema, PostBaseSchema } from "@/schema/post";
import type { FastifyInstance } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";
// import type { Tables, Inserts, Updates } from "@/types/db";

class PostsController extends BaseController<
  typeof CreatePostSchema,
  typeof UpdatePostSchema
> {
  constructor() {
    super("posts", CreatePostSchema, UpdatePostSchema);
  }

  public override registerExtraRoutes = async (
    app: FastifyInstance,
    tableName: string,
  ): Promise<void> => {};
}

export default new PostsController();
