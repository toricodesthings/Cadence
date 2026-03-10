export function ShortcutsTab() {
    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                System Keyboard Shortcuts
            </h2>

            <div className="overflow-hidden rounded-xl border border-twilight-border bg-white/[0.04]">
                <table className="w-full text-left text-sm text-twilight-text">
                    <thead className="border-b border-twilight-border bg-twilight-deep/80 text-xs uppercase tracking-wider text-twilight-text-soft">
                        <tr>
                            <th className="font-semibold px-6 py-4 w-1/2">Action</th>
                            <th className="font-semibold px-6 py-4">Keyboard Shortcut</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">Global Command Palette</td>
                            <td className="px-6 py-4">
                                <kbd className="bg-black/40 border border-white/10 rounded-md px-2 py-1 font-mono text-xs shadow-sm inline-flex items-center gap-1">
                                    <span>⌘</span> K
                                </kbd>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">Toggle View (List/Kanban)</td>
                            <td className="px-6 py-4">
                                <kbd className="bg-black/40 border border-white/10 rounded-md px-2 py-1 font-mono text-xs shadow-sm inline-flex items-center gap-1">
                                    <span>V</span>
                                </kbd>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">New Task (from Home)</td>
                            <td className="px-6 py-4">
                                <kbd className="bg-black/40 border border-white/10 rounded-md px-2 py-1 font-mono text-xs shadow-sm inline-flex items-center gap-1">
                                    <span>T</span>
                                </kbd>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">Focus Task Search</td>
                            <td className="px-6 py-4">
                                <kbd className="bg-black/40 border border-white/10 rounded-md px-2 py-1 font-mono text-xs shadow-sm inline-flex items-center gap-1">
                                    <span>/</span>
                                </kbd>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">Quick Archive Select Task</td>
                            <td className="px-6 py-4">
                                <kbd className="bg-black/40 border border-white/10 rounded-md px-2 py-1 font-mono text-xs shadow-sm inline-flex items-center gap-1">
                                    <span>E</span>
                                </kbd>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">Complete Task</td>
                            <td className="px-6 py-4">
                                <kbd className="bg-black/40 border border-white/10 rounded-md px-2 py-1 font-mono text-xs shadow-sm inline-flex items-center gap-1">
                                    <span>C</span>
                                </kbd>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="text-xs text-twilight-text-muted">* Keyboard shortcut remapping is not yet available in this version.</div>
        </div>
    );
}
