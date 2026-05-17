import ReactDOM from "react-dom/client";
import App from "./App";
import { installFrontendDebugHooks } from "./utils/debug";

installFrontendDebugHooks();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
