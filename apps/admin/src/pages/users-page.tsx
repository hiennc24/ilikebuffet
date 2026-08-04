/**
 * UsersPage — user administration (list, create, reset password/PIN, lock).
 *
 * The backend enforces who may manage whom (HQ full; QUAN_LY_CN only cashier/
 * warehouse roles in their branch) and returns a one-time temp password on create
 * and reset. This screen surfaces that temp password once for the admin to hand
 * over. Nav-hiding by role lands in P6.
 */
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Dialog, FormField } from "@ilikebuffet/ui";
import { useAuth } from "../auth/auth-context";
import { unwrapList } from "../lib/unwrap-list";
import { usePagedList } from "../lib/use-paged-list";
import { QUERY_KEYS } from "../lib/query-keys";
import { toast } from "../lib/toast";
import {
  Card,
  PageStack,
  FilterBar,
  DetailDrawer,
  Select,
  InlineError,
  LoadingState,
  ErrorState,
  toErrorMessage,
} from "./_shared/admin-ui";
import {
  DataTable,
  useDataTable,
  DataTablePagination,
  Badge,
  Avatar,
  createActionsColumn,
} from "./_shared/table";

const PAGE_SIZE = 20;

const ROLES = ["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI", "QUAN_LY_CN", "THU_NGAN", "THU_KHO"] as const;
type UserRole = (typeof ROLES)[number];
/** Fallback labels for system roles — used in the table when the roles query is not yet resolved. */
const ROLE_LABEL: Record<string, string> = {
  QUAN_TRI_HQ: "Quản trị HQ",
  CHU_CHUOI: "Chủ chuỗi",
  KE_TOAN_CHUOI: "Kế toán chuỗi",
  QUAN_LY_CN: "Quản lý CN",
  THU_NGAN: "Thu ngân",
  THU_KHO: "Thủ kho",
};
const CHAIN_WIDE_ROLES = new Set<UserRole>(["QUAN_TRI_HQ", "CHU_CHUOI", "KE_TOAN_CHUOI"]);

interface DbRole {
  code: string;
  name: string;
  isSystem: boolean;
  capabilities: string[];
  userCount: number;
}

interface AdminUser {
  id: string;
  username: string;
  role: UserRole;
  chainWide: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  branches: { branchId: string }[];
}
interface Branch {
  id: string;
  code: string;
  name: string;
}

const isLocked = (u: AdminUser) => !!u.lockedUntil && new Date(u.lockedUntil) > new Date();

export const UsersPage: React.FC = () => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = React.useState({ role: "", status: "", search: "" });
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AdminUser | null>(null);
  const [creating, setCreating] = React.useState(false);

  const rolesQuery = useQuery({
    queryKey: QUERY_KEYS.roles(),
    queryFn: () => api.get<{ data: DbRole[] }>("/rbac/roles"),
  });
  const dbRoles: DbRole[] = rolesQuery.data?.data ?? [];
  /** Merged label map: DB names take priority, fallback for any code not yet in DB. */
  const roleLabelMap = React.useMemo(() => {
    const map: Record<string, string> = { ...ROLE_LABEL };
    for (const r of dbRoles) map[r.code] = r.name;
    return map;
  }, [dbRoles]);

  const { rows, total, isLoading, isError, error } = usePagedList<AdminUser>({
    queryKey: QUERY_KEYS.users(),
    path: "/users",
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  const lockMutation = useMutation({
    mutationFn: (u: AdminUser) =>
      api.request<unknown>(`/users/${u.id}/${isLocked(u) ? "unlock" : "lock"}`, { method: "POST" }),
    onSuccess: (_data, u) => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.users() });
      toast.success(isLocked(u) ? "Đã mở khoá tài khoản." : "Đã khoá tài khoản.");
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const patch = (p: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const columns = React.useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        id: "user",
        enableSorting: false,
        meta: { headerLabel: "Người dùng" },
        header: "Người dùng",
        cell: ({ row }) => {
          const u = row.original;
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Avatar name={u.username} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                {u.username}
              </span>
            </span>
          );
        },
      },
      {
        id: "role",
        enableSorting: false,
        meta: { headerLabel: "Vai trò" },
        header: "Vai trò",
        cell: ({ row }) => roleLabelMap[row.original.role] ?? row.original.role,
      },
      {
        id: "scope",
        enableSorting: false,
        meta: { headerLabel: "Phạm vi" },
        header: "Phạm vi",
        cell: ({ row }) => {
          const u = row.original;
          return u.chainWide ? "Toàn chuỗi" : `${u.branches.length} CN`;
        },
      },
      {
        id: "status",
        enableSorting: false,
        meta: { headerLabel: "Trạng thái" },
        header: "Trạng thái",
        cell: ({ row }) => {
          const u = row.original;
          const locked = isLocked(u);
          return (
            <Badge tone={locked ? "warn" : "success"}>
              {locked ? "Đã khoá" : "Hoạt động"}
            </Badge>
          );
        },
      },
      createActionsColumn<AdminUser>({
        menu: [
          {
            key: "detail",
            label: "Chi tiết",
            onSelect: (u) => setSelected(u),
          },
          {
            key: "lock",
            label: "Khoá",
            hidden: (u) => isLocked(u),
            onSelect: (u) => lockMutation.mutate(u),
          },
          {
            key: "unlock",
            label: "Mở khoá",
            hidden: (u) => !isLocked(u),
            onSelect: (u) => lockMutation.mutate(u),
          },
        ],
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roleLabelMap],
  );

  const table = useDataTable<AdminUser>({
    data: rows,
    columns,
    total,
    page,
    limit: PAGE_SIZE,
    sort: null,
    setPage,
    setLimit: () => {},
    setSort: () => {},
    getRowId: (u) => u.id,
  });

  return (
    <PageStack>
      <Card
        title="Người dùng & vai trò"
        description="Tạo tài khoản, gán vai trò/chi nhánh, reset mật khẩu/PIN, khoá."
        actions={
          <Button variant="action" onClick={() => setCreating(true)}>
            Người dùng mới
          </Button>
        }
      >
        <FilterBar>
          <input type="search" aria-label="Tìm người dùng" placeholder="Tìm tên đăng nhập…" value={filters.search} onChange={(e) => patch({ search: e.target.value })} style={inputStyle} />
          <Select aria-label="Vai trò" value={filters.role} onChange={(e) => patch({ role: e.target.value })}>
            <option value="">Tất cả vai trò</option>
            {dbRoles.length > 0
              ? dbRoles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))
              : ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
          </Select>
          <Select aria-label="Trạng thái" value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
            <option value="">Tất cả</option>
            <option value="active">Hoạt động</option>
            <option value="locked">Đã khoá</option>
          </Select>
        </FilterBar>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={toErrorMessage(error, "Không tải được danh sách người dùng")} />
        ) : (
          <>
            <DataTable
              table={table}
              isLoading={false}
              isError={false}
              onRowClick={(u) => setSelected(u)}
              empty="Không có người dùng."
            />
            <DataTablePagination table={table} total={total} />
          </>
        )}
      </Card>

      {creating && <CreateUserDialog onClose={() => setCreating(false)} dbRoles={dbRoles} />}
      <UserDetailDrawer user={selected} onClose={() => setSelected(null)} />
    </PageStack>
  );
};

// ── Create dialog ─────────────────────────────────────────────────────────────

const CreateUserDialog: React.FC<{ onClose: () => void; dbRoles: DbRole[] }> = ({ onClose, dbRoles }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [username, setUsername] = React.useState("");
  const [role, setRole] = React.useState<string>("THU_NGAN");
  const [branchIds, setBranchIds] = React.useState<string[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [tempPassword, setTempPassword] = React.useState<string | null>(null);

  const branchesQuery = useQuery({
    queryKey: QUERY_KEYS.branches(),
    queryFn: () => api.get<Branch[] | { data: Branch[] }>("/branches"),
  });
  const branches = unwrapList(branchesQuery.data);
  // A role needs branch assignment if it is NOT one of the known chain-wide codes.
  // For custom roles from DB that are not in CHAIN_WIDE_ROLES, we default to requiring branch.
  const needsBranch = !CHAIN_WIDE_ROLES.has(role as UserRole);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ tempPassword: string; user: AdminUser }>("/users", {
        username,
        role,
        branchIds: needsBranch ? branchIds : undefined,
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.users() });
      setTempPassword(res.tempPassword);
    },
    onError: (e) => setFormError(toErrorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return setFormError("Tên đăng nhập 3–32 ký tự (chữ, số, . _ -)");
    if (needsBranch && branchIds.length === 0) return setFormError("Chọn ít nhất 1 chi nhánh");
    setFormError(null);
    createMutation.mutate();
  };

  const toggleBranch = (id: string) =>
    setBranchIds((cur) => (cur.includes(id) ? cur.filter((b) => b !== id) : [...cur, id]));

  return (
    <Dialog open title="Người dùng mới" onClose={onClose}>
      {tempPassword ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
            Đã tạo. Mật khẩu tạm (hiện <strong>một lần</strong>, người dùng phải đổi khi đăng nhập):
          </p>
          <code style={{ padding: "var(--space-3)", background: "var(--bg-sunken, #F1EDE7)", borderRadius: "var(--radius-md)", fontSize: "var(--text-base)", userSelect: "all" }}>
            {tempPassword}
          </code>
          <Button variant="action" onClick={onClose}>
            Xong
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <FormField name="username" label="Tên đăng nhập *" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="vd: thungan.cn1" />
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Vai trò
            <Select aria-label="Vai trò" value={role} onChange={(e) => setRole(e.target.value)}>
              {dbRoles.length > 0
                ? dbRoles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))
                : ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
            </Select>
          </label>

          {needsBranch && (
            <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <legend style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Chi nhánh</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "160px", overflowY: "auto" }}>
                {branches.map((b) => (
                  <label key={b.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
                    <input type="checkbox" checked={branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} aria-label={`Chi nhánh ${b.code}`} />
                    {b.code} — {b.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <InlineError message={formError} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
            <Button type="button" variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            <Button type="submit" variant="action" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Đang tạo…" : "Tạo"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
};

// ── Detail drawer (reset / lock actions) ────────────────────────────────────

const UserDetailDrawer: React.FC<{ user: AdminUser | null; onClose: () => void }> = ({ user, onClose }) => {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setNotice(null);
    setError(null);
  }, [user]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.users() });
  const act = (path: string, onOk: (body: unknown) => void) =>
    api
      .request<unknown>(`/users/${user!.id}/${path}`, { method: "POST" })
      .then((b) => {
        onOk(b);
        invalidate();
      })
      .catch((e) => setError(toErrorMessage(e)));

  if (!user) return <DetailDrawer open={false} title="" onClose={onClose} children={null} />;

  return (
    <DetailDrawer open title={`Người dùng ${user.username}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }}>
        <div>Vai trò: {ROLE_LABEL[user.role]}</div>
        <div>Trạng thái: {isLocked(user) ? "Đã khoá" : "Hoạt động"}</div>

        {notice && (
          <code style={{ padding: "var(--space-3)", background: "var(--bg-sunken, #F1EDE7)", borderRadius: "var(--radius-md)", userSelect: "all" }}>{notice}</code>
        )}
        <InlineError message={error} />

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <Button variant="ghost" onClick={() => act("reset-password", (b) => setNotice(`Mật khẩu tạm: ${(b as { tempPassword: string }).tempPassword}`))}>
            Reset mật khẩu
          </Button>
          <Button variant="ghost" onClick={() => act("reset-approval-pin", () => setNotice("Đã xoá PIN duyệt"))}>
            Reset PIN duyệt
          </Button>
          <Button variant="ghost" onClick={() => act("reset-cashier-pin", () => setNotice("Đã xoá PIN thu ngân"))}>
            Reset PIN thu ngân
          </Button>
          {isLocked(user) ? (
            <Button variant="ghost" onClick={() => act("unlock", () => setNotice("Đã mở khoá"))}>
              Mở khoá
            </Button>
          ) : (
            <Button variant="danger" onClick={() => act("lock", () => setNotice("Đã khoá"))}>
              Khoá tài khoản
            </Button>
          )}
        </div>
      </div>
    </DetailDrawer>
  );
};

const inputStyle: React.CSSProperties = {
  height: "var(--input-height, 44px)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};
