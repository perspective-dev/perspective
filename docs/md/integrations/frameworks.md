# Perspective with Next.js, Vue, Svelte and Angular

<!-- description: How to use the perspective-viewer data grid, pivot table and charting Web Component in Next.js, Vue, Svelte and Angular: client-side loading, registering the custom element, and passing a Table to load(). -->

`<perspective-viewer>` is a standard Web Component, so it works in any
framework which can render a DOM element and call a method on it. React has a
[dedicated wrapper](../how_to/javascript/react.md); elsewhere, use the element
directly.

Three rules apply everywhere:

1. **Initialize WebAssembly once**, before first use, as described in
   [Importing with or without a bundler](../how_to/javascript/importing.md).
2. **Client-side only.** Perspective needs Web Workers and WebAssembly, so it
   cannot be server-rendered.
3. **`load()` is a method, not an attribute.** Get a reference to the element
   and call `viewer.load(table)`; use `viewer.restore(config)` for
   configuration.

## Next.js

Load the component with `next/dynamic` and `ssr: false`, so Perspective is
only imported in the browser:

```tsx
import dynamic from "next/dynamic";

const Report = dynamic(() => import("../components/Report"), { ssr: false });
```

`components/Report.tsx` then uses
[`@perspective-dev/react`](../how_to/javascript/react.md) as normal.

## Vue

Tell the template compiler that `perspective-viewer` is a custom element:

```javascript
// vite.config.js
vue({
    template: {
        compilerOptions: {
            isCustomElement: (tag) => tag.startsWith("perspective-"),
        },
    },
});
```

```html
<script setup>
import { onMounted, ref } from "vue";

const viewer = ref(null);
onMounted(async () => {
    await viewer.value.load(table);
    await viewer.value.restore({ group_by: ["Region"] });
});
</script>

<template>
    <perspective-viewer ref="viewer"></perspective-viewer>
</template>
```

## Svelte

```html
<script>
    import { onMount } from "svelte";

    let viewer;
    onMount(async () => {
        await viewer.load(table);
    });
</script>

<perspective-viewer bind:this={viewer}></perspective-viewer>
```

## Angular

Add `CUSTOM_ELEMENTS_SCHEMA` to the component or module, and reach the element
with `@ViewChild`:

```typescript
@Component({
    selector: "app-report",
    template: `<perspective-viewer #viewer></perspective-viewer>`,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ReportComponent implements AfterViewInit {
    @ViewChild("viewer") viewer!: ElementRef;

    async ngAfterViewInit() {
        await this.viewer.nativeElement.load(table);
    }
}
```

## Cleaning up

When the component unmounts, call `viewer.delete()`, and `delete()` any
`View` and `Table` you created, in that order. See
[Cleaning up resources](../how_to/javascript/deleting.md).
