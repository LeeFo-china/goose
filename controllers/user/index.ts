import type { FastifyRequest, FastifyReply } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import type { Tables, Inserts, Updates } from "@/types/db";

const customerTableName = "customers" as const;

type Customer = Tables<typeof customerTableName>;
type CustomerInsert = Inserts<typeof customerTableName>;
type CustomerUpdate = Updates<typeof customerTableName>;
const customerTable = SupabaseDB.from(customerTableName);

export default class UserController {
  static async getUser(
    request: FastifyRequest<{ Params: Customer }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    if (!id) {
      throw Errors.badRequest("缺少 id");
    }

    const { data, error } = await customerTable.select();
    console.log("fetch data success!!");

    if (error) {
      throw Errors.dbError("数据库查询失败!", error);
    }

    return reply.send({
      id,
      name: "test user" + request.params.name,
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

    // if (error) {
    //   throw Errors.dbError("数据库插入失败", error);
    // }
    return { data, error };
  }

  static async updateUser(
    request: FastifyRequest<{ Params: CustomerUpdate }>,
    reply: FastifyReply,
  ) {
    const record_id = request.params.id;
    const record_data = request.body;

    const { data, error } = await customerTable
      .update(record_data)
      .eq("id", record_id)
      .select();

    return reply.send({ data, error });
  }
}
