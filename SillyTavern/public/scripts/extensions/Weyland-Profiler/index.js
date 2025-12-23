import { AutoExecuteHandler } from '../quick-reply/src/AutoExecuteHandler.js';

const MODULE_NAME = "Weyland-Profiler";
const extensionVersion = "1.0.0";

/* Consider an export button.

const exportBtn = document.createElement('button');
exportBtn.textContent = '📊 Export Profiling Data';
exportBtn.onclick = exportProfilingData;
// Add it wherever makes sense in your extension's UI
document.querySelector('#your-extensions-container')?.appendChild(exportBtn);
*/

const profilingData = [];

function profileAsyncMethod(target, methodName) {
    const original = target.prototype[methodName];

    target.prototype[methodName] = async function(...args) {
        const start = performance.now();
        try {
            const result = await original.apply(this, args);
            const duration = performance.now() - start;

            const entry = {
                method: `${target.name}.${methodName}`,
                duration,
                success: true,
                timestamp: Date.now()
            };

            profilingData.push(entry);

            return result;
        } catch (error) {
            const duration = performance.now() - start;

            const entry = {
                method: `${target.name}.${methodName}`,
                duration,
                success: false,
                timestamp: Date.now()
            };

            profilingData.push(entry);

            throw error;
        }
    };
}

function exportProfilingData() {
    const headers = ['Method', 'Duration (ms)', 'Success', 'Timestamp'];
    const csvRows = [headers.join(',')];

    profilingData.forEach(entry => {
        const row = [
            entry.method,
            entry.duration.toFixed(3),
            entry.success,
            new Date(entry.timestamp).toISOString()
        ];
        csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `profiling-data-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`Exported ${profilingData.length} profiling entries`);
}

// @ts-ignore
window.exportProfilingData = exportProfilingData;
// @ts-ignore
window.profilingData = profilingData;

(async function () {
    console.log(`[${MODULE_NAME}] Initializing Profiler v${extensionVersion}`);
    profileAsyncMethod(AutoExecuteHandler, 'handleStartup');
    profileAsyncMethod(AutoExecuteHandler, 'handleChatChanged');
    profileAsyncMethod(AutoExecuteHandler, 'handleNewChat');
})();
