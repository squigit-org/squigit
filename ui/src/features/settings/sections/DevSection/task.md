# we will use this section as a react compiler for stuff from web so i can chose the best component and place it in the real part of the project.

## first trial "shadcn"

### task:

```
go to "https://github.com/shadcn-ui"
 
and tell me how to bring this component to my app.
it's a ai prompt box in https://ui.shadcn.com/ examples landing page
```

### chatgpt suggestion:

````
To integrate a component like the AI prompt box from the shadcn/ui examples (which appears to be a custom-built input interface with add-context functionality, a multi-line prompt field, upload button, and toggles for modes like "Auto" and "All Sources"), you'll need to set up shadcn/ui in your React project and compose it using available components. This isn't a single pre-built component in shadcn/ui, but you can replicate it closely using Textarea for the input, Button for actions/submit/upload, and Toggle Group (or individual Toggles/Switches) for the mode selectors. The overall container can use a Card or div with Tailwind classes for the rounded, dark styling.

shadcn/ui works with React frameworks like Next.js, Vite, Remix, or Create React App, and requires Tailwind CSS for styling.

### Step 1: Prerequisites
- You need a React project (e.g., created with Create React App, Next.js, or Vite).
- Install Tailwind CSS if not already set up (follow the official Tailwind docs for your framework).
- Node.js and a package manager like npm, yarn, or pnpm.

### Step 2: Initialize shadcn/ui in Your Project
Run the following command in your project's root directory to set up shadcn/ui. This installs dependencies, configures Tailwind, adds utility functions, and creates a `components.json` file.

Using pnpm (recommended, but you can swap with npm or yarn):
```
pnpm dlx shadcn-ui@latest init
```

- This will prompt you for configurations (e.g., style: default or new-york; TypeScript: yes; base color: slate/zinc/neutral; etc.). Choose options that fit your app (e.g., dark mode support).
- If you prefer manual setup without the CLI prompts, follow the detailed manual steps from the docs (e.g., add dependencies like `class-variance-authority`, configure `tsconfig.json` paths, set up CSS variables in `globals.css`, and create `components.json` manually).

For a brand-new project, you can use:
```
pnpm dlx shadcn-ui@latest create
```
This scaffolds a full app with your chosen framework.

### Step 3: Add Required Components
Use the CLI to add individual components to your project. They'll be placed in a `components/ui` folder (configurable).

Run:
```
pnpm dlx shadcn-ui@latest add textarea
pnpm dlx shadcn-ui@latest add button
pnpm dlx shadcn-ui@latest add toggle-group
pnpm dlx shadcn-ui@latest add toggle  # If you prefer individual toggles over a group
pnpm dlx shadcn-ui@latest add card     # Optional for the container
pnpm dlx shadcn-ui@latest add label    # For labels like "@ Add context"
```

- This downloads the component code (e.g., `ui/textarea.tsx`) and any dependencies like `lucide-react` for icons.
- You can add multiple at once: `pnpm dlx shadcn-ui@latest add textarea button toggle-group`.

### Step 4: Build the AI Prompt Box Component
Create a new file in your project, e.g., `components/AIPromptBox.tsx`. Compose the UI using the added components and Tailwind classes for styling (matching the dark, rounded pill shape from the example).

Here's a sample implementation (assuming TypeScript and dark mode):

```tsx
import { cn } from "@/lib/utils"; // The cn helper from shadcn setup
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"; // Or use Toggle if not grouping
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Paperclip, ArrowUp } from "lucide-react"; // Icons from lucide-react

export function AIPromptBox() {
  return (
    <Card className="bg-background/95 border-border rounded-3xl p-4 shadow-lg max-w-2xl mx-auto">
      {/* Top: Add Context */}
      <div className="flex items-center mb-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Label className="cursor-pointer">@ Add context</Label>
        </Button>
      </div>

      {/* Main Prompt Input */}
      <Textarea
        placeholder="Ask, search, or make anything..."
        className="min-h-[60px] resize-none border-none focus-visible:ring-0 bg-transparent text-foreground"
      />

      {/* Bottom: Upload, Toggles, Submit */}
      <div className="flex items-center justify-between mt-2">
        <Button variant="ghost" size="icon">
          <Paperclip className="h-4 w-4" />
        </Button>
        <ToggleGroup type="multiple" className="flex space-x-2">
          <ToggleGroupItem value="auto" aria-label="Auto">
            Auto
          </ToggleGroupItem>
          <ToggleGroupItem value="all-sources" aria-label="All Sources">
            All Sources
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="default" size="icon" className="rounded-full">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
```

- **Customization Notes**:
  - Use `cn()` to merge custom Tailwind classes (e.g., for darker backgrounds: `bg-black` in dark mode).
  - Add logic for handling input (e.g., onChange, submit on enter) and toggles (e.g., state with useState).
  - For upload functionality, integrate a file input hidden behind the Paperclip button.
  - If you want auto-resizing textarea or suggestions (like a command palette), add the `command` component: `pnpm dlx shadcn-ui@latest add command`.
  - Style for dark mode is handled via CSS variables set during init.

### Step 5: Use It in Your App
Import and render it in your page/component, e.g., in `pages/index.tsx` (Next.js):
```tsx
import { AIPromptBox } from "@/components/AIPromptBox";

export default function Home() {
  return (
    <div className="p-8">
      <AIPromptBox />
    </div>
  );
}
```

Run your app (e.g., `pnpm dev`) and tweak styles/code as needed. If you need more components or examples, check the shadcn/ui docs for full component previews and props.
````

### plan:

implement gpt's advice in the section and let us see how it looks.

### note:

use npx.
