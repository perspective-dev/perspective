# React Component

We provide a React wrapper to prevent common issues and mistakes associated with
using the perspective-viewer web component in the context of React.

Before trying this example, please take a look at
[how to bootstrap perspective](./importing.md).

## `PerspectiveViewer`

A simple example using the `PerspectiveViewer` component:

```typescript
import React, { useCallback, useEffect, useRef } from "react";
import {
    PerspectiveViewer,
} from "@perspective-dev/react";
import perspective from "@perspective-dev/client";

function App() {
    const worker = useRef(null);

    useEffect(() => {
        (async () => {
            worker.current = await perspective.worker();
            const resp = await fetch("data.arrow");
            const arrow = await resp.arrayBuffer();
            await worker.current.table(arrow, { name: "my_table" });
        })();
    }, []);

    return (
            <PerspectiveViewer
                client={worker.current}
                config={{group_by: ["State"], columns: ["Sales"]}}
            />
    );
}
```