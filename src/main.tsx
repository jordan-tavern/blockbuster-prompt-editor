import React from "react";
import ReactDOM from "react-dom/client";

// Show something immediately so we know the page is loading
document.getElementById("root")!.innerHTML = '<div style="color:white;padding:40px;font-size:24px">Loading editor...</div>';

import("./App.tsx")
  .then(({ App }) => {
    ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
  })
  .catch((e) => {
    document.getElementById("root")!.innerHTML = `
      <div style="color:red;padding:40px;font-size:16px;font-family:monospace;white-space:pre-wrap">
        IMPORT ERROR:\n${e.message}\n\n${e.stack}
      </div>
    `;
  });
