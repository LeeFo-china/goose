import { Loader2, Plus } from "lucide-react";
import type {
  DepartmentPostRulePostOption,
  DepartmentRecord,
} from "@/components/organization/organization-types";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export function DepartmentPostSelectionSummary({
  dirty,
  selectedCodes,
  selectedPosts,
}: {
  dirty: boolean;
  selectedCodes: string[];
  selectedPosts: DepartmentPostRulePostOption[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={dirty ? "warning" : "secondary"}>
        {dirty ? "未保存" : "已保存"}
      </Badge>
      <span className="text-sm text-muted-foreground">
        已选 {selectedCodes.length} 个岗位
      </span>
      {selectedPosts.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {selectedPosts.map((post) => (
            <Badge key={post.code} variant="outline">
              {post.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DepartmentPostCommandItems({
  department,
  filteredPosts,
  selectedCodes,
  canCreatePost,
  trimmedKeyword,
  pending,
  onTogglePost,
  onCreatePost,
}: {
  department: DepartmentRecord;
  filteredPosts: DepartmentPostRulePostOption[];
  selectedCodes: string[];
  canCreatePost: boolean;
  trimmedKeyword: string;
  pending: boolean;
  onTogglePost: (postCode: string) => void;
  onCreatePost: () => void;
}) {
  return (
    <>
      {!canCreatePost && filteredPosts.length === 0 ? (
        <CommandEmpty>没有匹配的岗位</CommandEmpty>
      ) : null}
      <CommandGroup>
        {filteredPosts.map((post) => {
          const checked = selectedCodes.includes(post.code);
          return (
            <CommandItem
              key={post.code}
              value={`${post.name} ${post.code}`}
              disabled={pending}
              className={cn(
                "cursor-pointer items-start gap-3 py-2",
                checked ? "bg-accent/65" : "",
              )}
              onSelect={() => onTogglePost(post.code)}
            >
              <Checkbox
                checked={checked}
                disabled={pending}
                className="mt-1"
                aria-label={`选择${post.name}`}
                onCheckedChange={() => onTogglePost(post.code)}
                onClick={(event) => event.stopPropagation()}
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{post.name}</span>
                  {post.status === 0 ? <Badge variant="outline">停用</Badge> : null}
                </span>
                <span className="block break-all text-xs text-muted-foreground">
                  {post.code}
                </span>
              </span>
            </CommandItem>
          );
        })}
        {canCreatePost ? (
          <CommandItem
            value={`create ${trimmedKeyword}`}
            disabled={pending}
            className="cursor-pointer items-start gap-3 border-t py-3"
            onSelect={onCreatePost}
          >
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-3.5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                创建并加入当前部门：{trimmedKeyword}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {department.name}
              </span>
            </span>
          </CommandItem>
        ) : null}
      </CommandGroup>
    </>
  );
}
