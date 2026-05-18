import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAdminUsers,
  updateAdminUser,
  createAdminUser,
  deleteAdminUser,
  type AdminUser,
  type Role,
} from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { UserPlus, CheckCircle, XCircle, Trash2, ShieldCheck, Shield, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ROLE_LABELS: Record<Role, string> = {
  user: "User",
  admin: "Admin",
  superadmin: "Super Admin",
};

const ROLE_ICONS: Record<Role, React.ComponentType<{ className?: string }>> = {
  user: User,
  admin: Shield,
  superadmin: ShieldCheck,
};

export default function AdminUsersPage() {
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
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  async function handleCreateUser() {
    if (!newUsername || !newPassword) return;
    setCreateLoading(true);
    try {
      await createAdminUser(newUsername, newPassword, newRole);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User created successfully" });
      setCreateOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create user",
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
        Loading users…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Approve or deny access requests and manage staff accounts.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. dr.smith"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="superadmin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={createLoading || !newUsername || !newPassword}
              >
                {createLoading ? "Creating…" : "Create User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Pending Approval</h2>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
        <h2 className="text-base font-semibold">Active Users</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No active users found.
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
  const isCurrentUser = user.id === currentUserId;
  const RoleIcon = ROLE_ICONS[user.role];

  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.username}
        {isCurrentUser && (
          <Badge variant="outline" className="ml-2 text-[10px]">
            you
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
                {ROLE_LABELS[user.role]}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="superadmin">Super Admin</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      {!isPending && (
        <TableCell>
          <Badge
            variant={user.isActive ? "default" : "secondary"}
            className={user.isActive ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30" : ""}
          >
            {user.isActive ? "Active" : "Suspended"}
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
                title="Approve access"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                    title="Deny and remove"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Deny
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deny access request?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the account for <strong>{user.username}</strong>.
                      They can re-apply, but this action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={onDeny}
                    >
                      Deny & Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
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
                  title={user.isActive ? "Suspend access" : "Restore access"}
                >
                  {user.isActive ? (
                    <><XCircle className="h-3.5 w-3.5 mr-1" />Suspend</>
                  ) : (
                    <><CheckCircle className="h-3.5 w-3.5 mr-1" />Restore</>
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
                      title="Delete user"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete user?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the account for <strong>{user.username}</strong>.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={onDelete}
                      >
                        Delete
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
  );
}
