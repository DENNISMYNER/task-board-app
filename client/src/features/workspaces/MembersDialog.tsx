import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { SelectField, TextField } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { workspacesApi } from "../../lib/api";
import type { WorkspaceRole } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { qk } from "../../lib/queryKeys";
import { ROLE_LABEL, grantableRoles } from "../../lib/roles";
import { useMembers } from "./hooks";

interface Props {
  workspaceId: string;
  workspaceName: string;
  myRole: WorkspaceRole;
  open: boolean;
  onClose: () => void;
}

export function MembersDialog({ workspaceId, workspaceName, myRole, open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={`People in ${workspaceName}`}>
      <MembersBody workspaceId={workspaceId} myRole={myRole} />
    </Dialog>
  );
}

function MembersBody({ workspaceId, myRole }: { workspaceId: string; myRole: WorkspaceRole }) {
  const { data: members, isPending, isError } = useMembers(workspaceId);
  const roles = grantableRoles(myRole);

  return (
    <div className="flex flex-col gap-5 p-5">
      {isPending && <PageSpinner label="Loading members" />}
      {isError && <p className="text-sm text-signal">Couldn't load the member list. Close this and try again.</p>}
      {members && (
        <ul className="flex flex-col divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar person={m.user} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.user.name}</p>
                <p className="truncate text-[13px] text-muted">{m.user.email}</p>
              </div>
              <span className="text-[13px] text-muted">{ROLE_LABEL[m.role]}</span>
            </li>
          ))}
        </ul>
      )}
      {roles.length > 0 ? (
        <AddMemberForm workspaceId={workspaceId} roles={roles} />
      ) : (
        <p className="text-[13px] text-muted">Only admins and owners can add people.</p>
      )}
    </div>
  );
}

function AddMemberForm({ workspaceId, roles }: { workspaceId: string; roles: WorkspaceRole[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>(roles.includes("MEMBER") ? "MEMBER" : (roles[0] ?? "GUEST"));
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const add = useMutation({
    mutationFn: () => workspacesApi.addMember(workspaceId, { email: email.trim(), role }),
    onSuccess: (member) => {
      void queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
      toast({ title: `Added ${member.user.name}`, tone: "success" });
      setEmail("");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    add.mutate();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line pt-5">
      <p className="text-sm font-medium">Add someone</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <TextField label="Email" hideLabel type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} error={error ?? undefined} hint="They need an account already." />
        <SelectField label="Role" hideLabel value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
          {roles.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </SelectField>
      </div>
      <Button type="submit" variant="primary" className="self-end" loading={add.isPending} disabled={!email.trim()}>Add to workspace</Button>
    </form>
  );
}
