import type { FastifyRequest, FastifyReply } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import type { Tables, Inserts } from "@/types/db";

const customerTableName = "customers" as const;

type Customer = Tables<typeof customerTableName>;
type CustomerInsert = Inserts<typeof customerTableName>;
const customerTable = SupabaseDB.from(customerTableName);

type GetUserParams = {
  Params: {
    id: string;
  };
  Querystring: {
    name: string;
  };
  Body: {
    session_id: string;
    message: string;
  };
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export default class UserController {
  static async getUser(
    request: FastifyRequest<GetUserParams>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    if (!id) {
      throw Errors.badRequest("缺少 id");
    }

    const { data, error } = await SupabaseDB.from("admins").select();

    if (error) {
      throw Errors.dbError("数据库查询失败!", error);
    }

    return reply.send({
      id,
      name: "test user" + request.query.name,
      data,
    });
  }

  static async postUser(
    request: FastifyRequest<{ Body: CustomerInsert }>,
    reply: FastifyReply,
  ) {
    const { name, phone } = request.body;
    const { data, error } = await customerTable.insert({
      name,
      phone,
    });
    return { data, error };
  }

  static async updateUser(
    request: FastifyRequest<GetUserParams>,
    reply: FastifyReply,
  ) {
    const record_id = request.params.id;
    const record_data = request.body;

    const { data, error } = await SupabaseDB.from("n8n_chat_histories")
      .update(record_data)
      .eq("id", record_id)
      .select();

    return reply.send({ data, error });
  }
}
