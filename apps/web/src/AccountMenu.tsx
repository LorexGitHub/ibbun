import type { NavEntry } from "@mojibun/slice";
import { Link, useNavigate } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { entriesAt, type Who } from "./places.ts";

const Entries = ({ heading, entries }: { heading?: string; entries: NavEntry[] }) => {
  const navigate = useNavigate();
  if (entries.length === 0) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {heading && <DropdownMenuLabel className="menu-heading">{heading}</DropdownMenuLabel>}
        {entries.map((e) => (
          <DropdownMenuItem key={e.path} className="menu-item" onSelect={() => navigate(e.path)}>
            {e.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </>
  );
};

/** The right end of the bar: a way in for a visitor, and the account menu for a Learner. */
export const AccountMenu = ({ who, nav, onSignOut }: { who: Who; nav: NavEntry[]; onSignOut: () => void }) => {
  if (who.state === "loading") return <span className="who" aria-hidden />;
  if (who.state === "out")
    return (
      <Link className="pill" to="/login">
        Log in
      </Link>
    );
  const { email } = who.learner;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="who" aria-label={`Account: ${email}`}>
        {email[0]?.toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="menu zoom-in-100 zoom-out-100 w-64">
        <DropdownMenuLabel className="menu-email">{email}</DropdownMenuLabel>
        <Entries entries={entriesAt(nav, "account")} />
        <Entries heading="Supervisor" entries={entriesAt(nav, "supervisor")} />
        <DropdownMenuSeparator />
        <DropdownMenuItem className="menu-item" onSelect={onSignOut}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
