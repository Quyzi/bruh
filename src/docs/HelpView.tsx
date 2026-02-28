import { createSignal, For } from "solid-js";
import { getDocSections, type DocSection, type DocBlock } from "./content";

function DocBlockRenderer(props: { block: DocBlock }) {
  const block = () => props.block;
  return (
    <>
      {block().type === "paragraph" && (
        <p class="text-text-secondary text-sm leading-relaxed mb-3">{block().text}</p>
      )}
      {block().type === "heading" && (
        <>
          {block().level === 1 && (
            <h1 class="text-text-primary font-semibold text-xl border-b border-border pb-1 mb-2 mt-4">
              {block().text}
            </h1>
          )}
          {block().level === 2 && (
            <h2 class="text-text-primary font-semibold text-lg mb-2 mt-4">{block().text}</h2>
          )}
          {block().level === 3 && (
            <h3 class="text-text-primary font-semibold text-base mb-2 mt-2">{block().text}</h3>
          )}
        </>
      )}
      {block().type === "list" && (
        <ul
          classList={{
            "list-disc list-inside text-text-secondary text-sm mb-3 space-y-1": true,
            "list-decimal": block().ordered === true,
          }}
        >
          <For each={block().items}>{(item) => <li>{item}</li>}</For>
        </ul>
      )}
      {block().type === "code" && (
        <div class="mb-4">
          {block().caption && (
            <div class="text-text-tertiary text-xs mb-1">{block().caption}</div>
          )}
          <pre class="bg-bg-tertiary border border-border rounded p-3 text-xs text-text-primary overflow-x-auto font-mono whitespace-pre-wrap break-words">
            <code>{block().code}</code>
          </pre>
        </div>
      )}
      {block().type === "note" && (
        <div class="bg-accent/10 border border-accent/30 rounded p-3 text-accent text-sm mb-3">
          {block().text}
        </div>
      )}
      {block().type === "example" && (
        <div class="border border-border rounded p-3 mb-3 bg-bg-secondary">
          <div class="text-text-primary font-medium text-sm mb-1">{block().title}</div>
          <p class="text-text-secondary text-sm mb-2">{block().description}</p>
          {block().code && (
            <pre class="text-xs font-mono text-text-primary overflow-x-auto whitespace-pre-wrap">
              {block().code}
            </pre>
          )}
        </div>
      )}
    </>
  );
}

function SectionContent(props: { section: DocSection }) {
  return (
    <div class="mb-8">
      <For each={props.section.content}>
        {(block) => <DocBlockRenderer block={block} />}
      </For>
    </div>
  );
}

export function HelpView() {
  const sections = getDocSections();
  const [activeId, setActiveId] = createSignal<string>(sections[0]?.id ?? "getting-started");

  const scrollToSection = (id: string) => {
    setActiveId(id);
    const el = document.getElementById(`doc-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div class="flex h-full min-h-0 w-full">
      <aside class="w-48 shrink-0 border-r border-border bg-bg-secondary flex flex-col overflow-hidden">
        <div class="p-3 border-b border-border">
          <h2 class="text-text-primary font-medium text-sm">Documentation</h2>
        </div>
        <nav class="flex-1 overflow-y-auto p-2">
          <For each={sections}>
            {(section) => (
              <button
                type="button"
                onClick={() => scrollToSection(section.id)}
                classList={{
                  "w-full text-left px-3 py-2 rounded text-sm transition-colors cursor-pointer": true,
                  "bg-accent text-white": activeId() === section.id,
                  "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary":
                    activeId() !== section.id,
                }}
              >
                {section.title}
              </button>
            )}
          </For>
        </nav>
      </aside>
      <main class="flex-1 overflow-y-auto p-6">
        <div class="max-w-3xl">
          <For each={sections}>
            {(section) => (
              <section
                id={`doc-${section.id}`}
                class="scroll-mt-4"
              >
                <SectionContent section={section} />
              </section>
            )}
          </For>
        </div>
      </main>
    </div>
  );
}
