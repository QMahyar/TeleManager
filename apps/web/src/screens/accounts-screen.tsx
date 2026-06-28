import {
  IconFileImport,
  IconLogin2,
  IconUsers,
} from "@tabler/icons-react"

import { Tabs } from "../components/ui"
import type { AccountsTab } from "../types"
import { FleetTab } from "./accounts/fleet-tab"
import { LoginTab } from "./accounts/login-tab"
import { TransferTab } from "./accounts/transfer-tab"
import type { AccountsScreenProps } from "./screen-props"

export function AccountsScreen(props: AccountsScreenProps) {
  const tab = props.accountsTab
  const setTab = props.setAccountsTab
  const pendingCount = props.accounts.filter(
    (account) =>
      account.status === "login_pending" ||
      account.status === "password_pending"
  ).length

  return (
    <div className="space-y-4">
      <Tabs<AccountsTab>
        value={tab}
        onChange={setTab}
        items={[
          { id: "fleet", label: "Fleet", icon: IconUsers, badge: props.accounts.length || undefined },
          { id: "login", label: "Add / Login", icon: IconLogin2, badge: pendingCount || undefined },
          { id: "transfer", label: "Import / Export", icon: IconFileImport },
        ]}
      />
      {tab === "fleet" ? <FleetTab props={props} /> : null}
      {tab === "login" ? <LoginTab props={props} /> : null}
      {tab === "transfer" ? <TransferTab props={props} /> : null}
    </div>
  )
}
