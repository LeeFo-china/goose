// The project audience shares text/pagination limits with internal comments,
// but has separate storage, permissions and response visibility.
export {
  InternalCommentParamsSchema as ProjectCommentParamsSchema,
  InternalCommentCreateSchema as ProjectCommentCreateSchema,
  InternalCommentQuerySchema as ProjectCommentQuerySchema,
  type InternalCommentCreateInput as ProjectCommentCreateInput,
} from "./project-log-internal-comments";
