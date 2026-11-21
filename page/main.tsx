import "@fontsource-variable/inter";
import "./theme";
import { LinkProvider, type LinkComponent } from "@jaetask/toolkit/suite";
import { Toaster } from "@jaetask/toolkit/ui/sonner";
import { TooltipProvider } from "@jaetask/toolkit/ui/tooltip";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { hashPath } from "./router";

const HashLink: LinkComponent = ({ href, children, ...rest }) => (
  <a href={href.startsWith("/") ? `#${href}` : href} {...rest}>
    {children}
  </a>
);

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <LinkProvider link={HashLink} location={hashPath}>
        <TooltipProvider delayDuration={300}>
          <App />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </LinkProvider>
    </StrictMode>,
  );
