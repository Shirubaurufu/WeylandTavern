const LOG_PREFIX = "[Streamlined UI] ";
const DEBUG_MODE = false;
const PATCHER_ACTION_TYPES = {
    MOVE: "MOVE",
    ATTRIBUTE: "ATTRIBUTE",
    ADD_CLASS: "ADD_CLASS",
    REMOVE_CLASS: "REMOVE_CLASS",
    CONTENT: "CONTENT",
    REMOVE: "REMOVE",
    INSERT: "INSERT",
}


function applyPatch(patch) {
    
    if (!patch?.target) {
        return `${LOG_PREFIX} Target not specified for ${patch.name}`;
    }

    const target = document.querySelector(patch.target);
    if (!target) {
        return `${LOG_PREFIX} Target not found for ${patch.name}`;
    }

    if (!patch.actions) {
        return `${LOG_PREFIX} Actions not specified for ${patch.name}`;
    }

    let count = 0;
    for (const action of patch.actions) {
        switch (action.type) {
            case PATCHER_ACTION_TYPES.MOVE:
                
                const ip = document.querySelector(action.insertionPoint);
                if (!ip) {
                    console.warn(`${LOG_PREFIX} Insertion point not found for ${patch.name} (action ${count})`);
                    continue;
                }
    
                const parent = ip.parentElement;
                if (!parent && ip !== document.body) {
                    console.warn(`${LOG_PREFIX} Insertion point parent not found for ${patch.name} (action ${count})`);
                    continue;
                }
    
                switch (action.position) {
                    case "before":
                        parent.insertBefore(target, ip);
                        break;
                    case "after":
                        ip.after(target);
                        break;
                    case "start":
                        ip.insertBefore(target, ip.firstChild);
                        break;
                    case "end":
                        ip.appendChild(target);
                        break;
                    default:
                        console.warn(`${LOG_PREFIX} Invalid position for ${patch.name} (action ${count})`);
                        continue;
                }
                break;
    
            case PATCHER_ACTION_TYPES.ATTRIBUTE:
    
                if (!action.attribute) {
                    console.warn(`${LOG_PREFIX} Attribute not specified for ${patch.name} (action ${count})`);
                    continue;
                }
                if (!action.value) {
                    target.removeAttribute(action.attribute);
                } else {
                    target.setAttribute(action.attribute, action.value);
                }
                break;
    
            case PATCHER_ACTION_TYPES.ADD_CLASS:
    
                if (!action.class) {
                    console.warn(`${LOG_PREFIX} Class not specified for ${patch.name} (action ${count})`);
                    continue;
                }
                target.classList.add(action.class);
                break;
    
            case PATCHER_ACTION_TYPES.REMOVE_CLASS:
    
                if (!action.class) {
                    console.warn(`${LOG_PREFIX} Class not specified for ${patch.name} (action ${count})`);
                    continue;
                }
                target.classList.remove(action.class);
                break;
    
            case PATCHER_ACTION_TYPES.CONTENT:
    
                if (!action.content) {
                    console.warn(`${LOG_PREFIX} Content not specified for ${patch.name} (action ${count})`);
                    continue;
                }
                target.innerHTML = action.content;
                break;
    
            case PATCHER_ACTION_TYPES.REMOVE:
    
                target.remove();
                break;
    
            case PATCHER_ACTION_TYPES.INSERT:

                if (!action.content) {
                    console.warn(`${LOG_PREFIX} Content not specified for ${patch.name} (action ${count})`);
                    continue;
                }

                let container = document.createElement("div");
                container.innerHTML = action.content;
                if (action.position == "start") {
                    target.insertBefore(container.firstChild, target.firstChild);
                }
                else if (action.position == "end") {
                    target.appendChild(container.firstChild);
                }
                else if (action.position == "before") {
                    target.parentElement.insertBefore(container.firstChild, target);
                }
                else if (action.position == "after") {
                    target.parentElement.after(container.firstChild);
                }
                else {
                    console.warn(`${LOG_PREFIX} Invalid position for ${patch.name} (action ${count})`);
                    continue;
                }
                container.remove();
                break;

            default:
                console.warn(`${LOG_PREFIX} Invalid action type for ${patch.name} (action ${count})`);
                continue;
        }
        if (DEBUG_MODE) {   
            console.log(`${LOG_PREFIX} Patch ${patch.name} (action ${count}) applied successfully`);
        }
        count++;
    }
    if (DEBUG_MODE) {
        console.log(`${LOG_PREFIX} Patch ${patch.name} applied successfully`);
    }
}

function applyPatches() {

    let patches = [];
    try {
        const request = new XMLHttpRequest();
        request.open("GET", "scripts/extensions/streamlined-ui/patches.json", false); 
        request.send(null);
        if (request.status === 200) {
            patches = JSON.parse(request.responseText);
        } else {
            console.error(`${LOG_PREFIX} Failed to load patches.json: status`, request.status);
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} Error loading patches.json:`, e);
    }
    for (const patch of patches) {
        const result = applyPatch(patch);
        if (result) {
            console.warn(result);
        }
    }
}

export default applyPatches;