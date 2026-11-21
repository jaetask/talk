import {
  EditFrame,
  EditLink,
  Facts,
  ListCard,
  ListRow,
  PageBody,
  Panel,
  Row,
  useBackTo,
} from "@jaetask/toolkit/suite";
import { ToggleGroup, ToggleGroupItem } from "@jaetask/toolkit/ui/toggle-group";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { go } from "../router";
import { useStore } from "../store";
import { saveTheme, type Theme, useTheme } from "../theme";
import type { Toolkit } from "../types";

const THEMES: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

export function SettingsPage() {
  const theme = useTheme();
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
    <PageBody title="Settings" line="How Talk looks, and the apps its bots can use.">
      <Panel
        id="theme"
        title="Theme"
        line="System follows your device's light or dark setting."
        action={<EditLink to="/settings/theme" />}
      >
        <Facts items={[{ label: "Theme", value: THEMES[theme] }]} />
      </Panel>
      <Panel
        id="apps"
        title="Apps"
        line="Each app is an MCP server listed in apps.json. Bots ask before anything that deletes, archives or sends."
      >
        {apps === null ? (
          <p className="quiet">Checking…</p>
        ) : apps.length === 0 ? (
          <p className="quiet">No apps. Add them to apps.json and restart Talk.</p>
        ) : (
          <ListCard as="ul">
            {apps.map((a) => (
              <ListRow
                key={a.slug}
                aside={<span className="quiet">{a.connected ? "Online" : "Offline"}</span>}
              >
                <span className="task-text">
                  <span className="task-title">{a.name}</span>
                  {a.description && <span className="task-note">{a.description}</span>}
                </span>
              </ListRow>
            ))}
          </ListCard>
        )}
      </Panel>
    </PageBody>
  );
}

function ThemeEdit() {
  const backTo = useBackTo("/settings");
  const [theme, setTheme] = useState(useTheme());
  return (
    <EditFrame
      title="Theme"
      line="Light, dark, or the same as your device."
      backTo={backTo}
      onSave={() => {
        saveTheme(theme);
        go(backTo);
      }}
    >
      <Row title="Theme" line="System follows your device.">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={theme}
          onValueChange={(v) => v && setTheme(v as Theme)}
          aria-label="Theme"
        >
          {(Object.keys(THEMES) as Theme[]).map((t) => (
            <ToggleGroupItem key={t} value={t}>
              {THEMES[t]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Row>
    </EditFrame>
  );
}

export function SettingsEditPage({ section }: { section: string }) {
  if (section === "theme") return <ThemeEdit />;
  return <p className="quiet">No such settings page.</p>;
}
