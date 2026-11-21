import { EmptyLine, ListCard, PageSection, WorkPage } from "@jaetask/toolkit/suite";
import { ToggleGroup, ToggleGroupItem } from "@jaetask/toolkit/ui/toggle-group";
import { IconApps, IconPalette } from "@tabler/icons-react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { saveTheme, type Theme, useTheme } from "../theme";
import type { Toolkit } from "../types";

export const SETTINGS: [string, string, ReactNode][] = [
  ["general", "General", <IconPalette key="general" size={16} aria-hidden />],
  ["apps", "Apps", <IconApps key="apps" size={16} aria-hidden />],
];

const THEMES: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

function General() {
  const theme = useTheme();
  return (
    <WorkPage title="General" help="How Talk looks in this browser.">
      <PageSection title="Theme">
        <div className="setting-line">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={theme}
            onValueChange={(v) => v && saveTheme(v as Theme)}
            aria-label="Theme"
          >
            {(Object.keys(THEMES) as Theme[]).map((t) => (
              <ToggleGroupItem key={t} value={t}>
                {THEMES[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </PageSection>
    </WorkPage>
  );
}

function Apps() {
  const version = useStore((s) => s.connectionsVersion);
  const [apps, setApps] = useState<Toolkit[] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a connections event bumps the version
  useEffect(() => {
    api
      .apps()
      .then((r) => setApps(r.apps))
      .catch(() => setApps([]));
  }, [version]);
  return (
    <WorkPage
      title="Apps"
      help="Each app is an MCP server listed in the apps file. Bots ask before anything that deletes, archives, sends or pays."
    >
      <PageSection title="Apps" count={apps?.length}>
        {apps === null ? (
          <EmptyLine>Checking…</EmptyLine>
        ) : apps.length === 0 ? (
          <EmptyLine>No apps. Add them to the apps file and restart Talk.</EmptyLine>
        ) : (
          <ListCard>
            {apps.map((a) => (
              <li key={a.slug} className="tk-list-row">
                <span className="task-text">
                  <span className="task-title">{a.name}</span>
                  {a.description && <span className="task-note">{a.description}</span>}
                </span>
                <span className="quiet">{a.connected ? "Online" : "Offline"}</span>
              </li>
            ))}
          </ListCard>
        )}
      </PageSection>
    </WorkPage>
  );
}

export function SettingsPage({ section }: { section: string }) {
  if (section === "apps") return <Apps />;
  return <General />;
}
