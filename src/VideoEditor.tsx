import { useEffect } from 'react'

export default function VideoEditor({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    if (customElements.get('construct-editor')) return

    const script = document.createElement('script')
    script.type = 'module'
    script.textContent = `
      Promise.all([
        import("/node_modules/@benev/slate/x/node.js"),
        import("/node_modules/@benev/construct/x/mini.js"),
        import("/node_modules/@omnimedia/omniclip/x/context/context.js"),
        import("/node_modules/@omnimedia/omniclip/x/components/omni-timeline/component.js"),
        import("/node_modules/@omnimedia/omniclip/x/components/omni-timeline/panel.js"),
      ]).then(([slate, construct, context, timeline, timelinePanel]) => {
        const { register_to_dom } = slate
        const { ConstructEditor, single_panel_layout } = construct
        const { omnislate, OmniContext } = context
        const { OmniTimeline } = timeline
        const { TimelinePanel } = timelinePanel

        omnislate.context = new OmniContext({
          projectId: "video-editor-project",
          panels: { TimelinePanel },
          layouts: {
            empty: single_panel_layout("TimelinePanel"),
            default: single_panel_layout("TimelinePanel"),
          },
        })

        register_to_dom({ OmniTimeline, ConstructEditor })
        console.log('omniclip initialized')
      }).catch(e => console.error('omniclip init error:', e))
    `
    document.head.appendChild(script)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-700">
        <button
          onClick={onBack}
          className="text-zinc-400 hover:text-white transition-colors text-sm flex items-center gap-2"
        >
          ← Back
        </button>
        <h1 className="text-white font-semibold">Video Editor</h1>
      </div>
      <div className="flex-1">
        <construct-editor style={{ display: 'block', width: '100%', height: '100%' }}></construct-editor>
      </div>
    </div>
  )
}