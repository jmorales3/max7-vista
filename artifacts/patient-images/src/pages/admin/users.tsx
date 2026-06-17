import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  listAdminUsers,
  updateAdminUser,
  createAdminUser,
  deleteAdminUser,
  getPatientAccess,
  setPatientAccess,
  type AdminUser,
  type Role,
} from "@/lib/auth";
import { getApiUrl } from "@/lib/apiUrl";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, CheckCircle, XCircle, Trash2, ShieldCheck, Shield, User, KeyRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ROLE_ICONS: Record<Role, React.ComponentType<{ className?: string }>> = {
  user: User,
  admin: Shield,
  superadmin: ShieldCheck,
};

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("user");
  const [createLoading, setCreateLoading] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: listAdminUsers,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { isActive?: boolean; role?: Role } }) =>
      updateAdminUser(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: t("admin.removed") });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  async function handleCreateUser() {
    if (!newUsername || !newPassword) return;
    setCreateLoading(true);
    try {
      await createAdminUser(newUsername, newPassword, newRole);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: t("admin.created") });
      setCreateOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
    } catch (err: unknown) {
      toast({
        title: t("common.error"),
        description: err instanceof Error ? err.message : t("admin.createFailed"),
        variant: "destructive",
      });
    } finally {
      setCreateLoading(false);
    }
  }

  const pending = users.filter((u) => !u.isActive);
  const active = users.filter((u) => u.isActive);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        {t("admin.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("admin.subtitle")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              {t("admin.addUser")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("admin.createTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("admin.username")}</Label>
                <Input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={t("admin.usernamePlaceholder")}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.password")}</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("admin.passwordPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.role")}</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t("admin.roleUser")}</SelectItem>
                    <SelectItem value="admin">{t("admin.roleAdmin")}</SelectItem>
                    <SelectItem value="superadmin">{t("admin.roleSuperAdmin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={createLoading || !newUsername || !newPassword}
              >
                {createLoading ? t("admin.creating") : t("admin.createUser")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{t("admin.pendingApproval")}</h2>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.colUsername")}</TableHead>
                  <TableHead>{t("admin.colRegistered")}</TableHead>
                  <TableHead>{t("admin.colRole")}</TableHead>
                  <TableHead className="text-right">{t("admin.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    currentUserId={currentUser?.id}
                    onApprove={() => updateMutation.mutate({ id: u.id, updates: { isActive: true } })}
                    onDeny={() => deleteMutation.mutate(u.id)}
                    onRoleChange={(role) => updateMutation.mutate({ id: u.id, updates: { role } })}
                    onDelete={() => deleteMutation.mutate(u.id)}
                    isPending
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-base font-semibold">{t("admin.activeUsers")}</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.colUsername")}</TableHead>
                <TableHead>{t("admin.colJoined")}</TableHead>
                <TableHead>{t("admin.colRole")}</TableHead>
                <TableHead>{t("admin.colStatus")}</TableHead>
                <TableHead className="text-right">{t("admin.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t("admin.noActiveUsers")}
                  </TableCell>
                </TableRow>
              )}
              {active.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  currentUserId={currentUser?.id}
                  onApprove={() => updateMutation.mutate({ id: u.id, updates: { isActive: true } })}
                  onDeny={() => updateMutation.mutate({ id: u.id, updates: { isActive: false } })}
                  onRoleChange={(role) => updateMutation.mutate({ id: u.id, updates: { role } })}
                  onDelete={() => deleteMutation.mutate(u.id)}
                  isPending={false}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
  onApprove,
  onDeny,
  onRoleChange,
  onDelete,
  isPending,
}: {
  user: AdminUser;
  currentUserId?: number;
  onApprove: () => void;
  onDeny: () => void;
  onRoleChange: (role: Role) => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const isCurrentUser = user.id === currentUserId;
  const RoleIcon = ROLE_ICONS[user.role];
  const [patientAccessOpen, setPatientAccessOpen] = useState(false);

  const roleLabels: Record<Role, string> = {
    user: t("admin.roleUser"),
    admin: t("admin.roleAdmin"),
    superadmin: t("admin.roleSuperAdmin"),
  };

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          {user.username}
          {isCurrentUser && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              {t("admin.you")}
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
        </TableCell>
        <TableCell>
          <Select
            value={user.role}
            onValueChange={(v) => onRoleChange(v as Role)}
            disabled={isCurrentUser}
          >
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue>
                <span className="flex items-center gap-1.5">
                  <RoleIcon className="h-3 w-3" />
                  {roleLabels[user.role]}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">{t("admin.roleUser")}</SelectItem>
              <SelectItem value="admin">{t("admin.roleAdmin")}</SelectItem>
              <SelectItem value="superadmin">{t("admin.roleSuperAdmin")}</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        {!isPending && (
          <TableCell>
            <Badge
              variant={user.isActive ? "default" : "secondary"}
              className={user.isActive ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30" : ""}
            >
              {user.isActive ? t("admin.statusActive") : t("admin.statusSuspended")}
            </Badge>
          </TableCell>
        )}
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {isPending ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={onApprove}
                  title={t("admin.approveTitle")}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t("admin.approve")}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                      title={t("admin.denyTitle")}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      {t("admin.deny")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("admin.denyDialogTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("admin.denyDialogDescPre")} <strong>{user.username}</strong>. {t("admin.denyDialogDescPost")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={onDeny}
                      >
                        {t("admin.denyDelete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                {user.role === "user" && !isCurrentUser && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => setPatientAccessOpen(true)}
                    title={t("admin.patientAccess")}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1" />
                    {t("admin.patientAccessManage")}
                  </Button>
                )}
                {!isCurrentUser && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-7 text-xs ${
                      user.isActive
                        ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        : "text-green-600 hover:text-green-700 hover:bg-green-50"
                    }`}
                    onClick={user.isActive ? onDeny : onApprove}
                    title={user.isActive ? t("admin.suspendTitle") : t("admin.restoreTitle")}
                  >
                    {user.isActive ? (
                      <><XCircle className="h-3.5 w-3.5 mr-1" />{t("admin.suspend")}</>
                    ) : (
                      <><CheckCircle className="h-3.5 w-3.5 mr-1" />{t("admin.restore")}</>
                    )}
                  </Button>
                )}
                {!isCurrentUser && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-destructive hover:bg-destructive/10"
                        title={t("admin.deleteTitle")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("admin.deleteDialogTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("admin.deleteDialogDescPre")} <strong>{user.username}</strong>. {t("admin.deleteDialogDescPost")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={onDelete}
                        >
                          {t("common.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
      {user.role === "user" && (
        <PatientAccessDialog
          userId={user.id}
          username={user.username}
          open={patientAccessOpen}
          onClose={() => setPatientAccessOpen(false)}
        />
      )}
    </>
  );
}

interface PatientItem {
  id: number;
  name: string;
  patientCode: string;
}

function PatientAccessDialog({
  userId,
  username,
  open,
  onClose,
}: {
  userId: number;
  username: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [search, setSearch] = useState("");

  const { data: patients = [], isLoading: patientsLoading } = useQuery<PatientItem[]>({
    queryKey: ["admin-patients-list"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/patients"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load patients");
      return res.json();
    },
    enabled: open,
  });

  const { data: currentAccess, isLoading: accessLoading } = useQuery<number[]>({
    queryKey: ["patient-access", userId],
    queryFn: () => getPatientAccess(userId),
    enabled: open,
  });

  if (open && !initialized && currentAccess !== undefined) {
    setSelected(new Set(currentAccess));
    setInitialized(true);
  }

  if (!open && initialized) {
    setInitialized(false);
    setSearch("");
  }

  function togglePatient(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.patientCode.toLowerCase().includes(search.toLowerCase()),
  );

  function selectAll() {
    setSelected(new Set(patients.map((p) => p.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setPatientAccess(userId, Array.from(selected));
      toast({ title: t("admin.patientAccessSaved") });
      onClose();
    } catch (err: unknown) {
      toast({
        title: t("common.error"),
        description: err instanceof Error ? err.message : t("admin.patientAccessSaveError"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const isLoading = patientsLoading || accessLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.patientAccessTitle", { username })}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("admin.patientAccessDesc")}</p>

        {isLoading ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            {t("admin.patientAccessLoading")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {selected.size === 0
                  ? t("admin.patientAccessUnrestricted")
                  : t("admin.patientAccessRestricted", { count: selected.size })}
              </span>
              <div className="flex gap-2">
                <button onClick={selectAll} className="underline hover:no-underline">
                  {t("admin.patientAccessSelectAll")}
                </button>
                <button onClick={clearAll} className="underline hover:no-underline">
                  {t("admin.patientAccessClearAll")}
                </button>
              </div>
            </div>
            <Input
              placeholder={t("admin.patientAccessSearch")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <ScrollArea className="h-48 border rounded-md p-2">
              {filteredPatients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("admin.patientAccessNoPatients")}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredPatients.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => togglePatient(p.id)}
                      />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground text-xs ml-auto">{p.patientCode}</span>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || isLoading}>
            {saving ? t("common.loading") : t("admin.patientAccessSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
