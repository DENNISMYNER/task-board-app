import { ChevronDown, LogOut, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router";
import { Avatar } from "../../components/ui/Avatar";
import { Dialog } from "../../components/ui/Dialog";
import { Menu, MenuItem, MenuSeparator } from "../../components/ui/Menu";
import { useCurrentUser, useAuth } from "../auth/useAuth";
import { CreateWorkspaceForm } from "../workspaces/CreateWorkspaceForm";
import { useWorkspaces } from "../workspaces/hooks";
import { writeLastWorkspace } from "../workspaces/lastWorkspace";

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-accent" />
      <rect x="6" y="7" width="5" height="18" rx="1.5" className="fill-accent-ink" />
      <rect x="13.5" y="7" width="5" height="11" rx="1.5" className="fill-accent-ink" opacity=".8" />
      <rect x="21" y="7" width="5" height="14" rx="1.5" className="fill-accent-ink" opacity=".6" />
    </svg>
  );
}

/** The frame around every signed-in page: top bar with workspace switcher and account menu. */
export function AppShell() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const { data: workspaces } = useWorkspaces();
  const [creating, setCreating] = useState(false);

  const current = workspaces?.find((w) => w.id === workspaceId);
  const currentId = current?.id;
  useEffect(() => {
    if (currentId) writeLastWorkspace(currentId);
  }, [currentId]);

  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:shadow-xl"
      >
        Skip to content
      </a>

      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-line px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 rounded-md font-display text-lg font-semibold">
          <BrandMark />
          <span className="hidden sm:inline">Task Board</span>
        </Link>

        {workspaces && workspaces.length > 0 && (
          <>
            <span className="text-line-strong" aria-hidden>
              /
            </span>
            <Menu
              label="Workspaces"
              triggerClassName="flex h-8 max-w-56 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-ink/5"
              trigger={
                <>
                  <span className="truncate">{current?.name ?? "Choose workspace"}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
                </>
              }
            >
              {(close) => (
                <>
                  {workspaces.map((w) => (
                    <MenuItem
                      key={w.id}
                      role="menuitemradio"
                      checked={w.id === current?.id}
                      onSelect={() => {
                        close();
                        void navigate(`/w/${w.id}`);
                      }}
                    >
                      <span className="truncate">{w.name}</span>
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem
                    onSelect={() => {
                      close();
                      setCreating(true);
                    }}
                  >
                    <Plus className="size-4" aria-hidden /> New workspace
                  </MenuItem>
                </>
              )}
            </Menu>
          </>
        )}

        <div className="ml-auto">
          <Menu
            label="Account"
            triggerLabel="Account menu"
            align="right"
            triggerClassName="grid size-8 place-items-center rounded-full hover:ring-2 hover:ring-line-strong"
            trigger={<Avatar person={user} size={28} />}
          >
            {(close) => (
              <>
                <div role="presentation" className="px-2.5 py-2">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-[13px] text-muted">{user.email}</p>
                </div>
                <MenuSeparator />
                <MenuItem
                  onSelect={() => {
                    close();
                    void logout().then(() => navigate("/login", { replace: true }));
                  }}
                >
                  <LogOut className="size-4" aria-hidden /> Sign out
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </header>

      <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>

      <Dialog open={creating} onClose={() => setCreating(false)} title="New workspace">
        <div className="p-5">
          <CreateWorkspaceForm
            autoFocus
            onCancel={() => setCreating(false)}
            onCreated={(w) => {
              setCreating(false);
              void navigate(`/w/${w.id}`);
            }}
          />
        </div>
      </Dialog>
    </div>
  );
}
