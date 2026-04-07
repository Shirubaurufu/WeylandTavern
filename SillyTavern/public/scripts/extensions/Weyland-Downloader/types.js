/**
 * @typedef {Object} Expression
 * @property {string} filename
 * @property {number} version
 */

/**
 * @typedef {Object} Costume
 * @property {string} name
 * @property {Expression[]} expressions
 */

/**
 * @typedef {Object} SubCharacter
 * @property {string} name
 * @property {Costume[]} costumes
 */

/**
 * @typedef {Object} World
 * @property {string} filename
 * @property {number} version
 */


/**
 * @typedef {Object} Character Local Manifest does not have the zone property
 * @property {string} name
 * @property {number | null} version
 * @property {SubCharacter[]} subcharacters
 * @property {World[]} [lorebooks]
 * @property {string | null} [zone]
 */

/**
 * @typedef {Object} Manifest
 * @property {Character[]} characters
 */

/**
 * @typedef {Object} ManifestResponse
 * @property {Manifest} remoteManifest
 * @property {Manifest} localManifest
 * @property {Manifest} pendingDiff
 */

/**
 * @typedef {Object} FailedFile Full file path = character + filePath
 * @property {string} character
 * @property {string} filePath
 */

/**
 * @typedef {Object} ProgressEvent
 * @property {'progress'} type
 * @property {string} character
 * @property {number} completed
 * @property {number} total
 */

/**
 * @typedef {Object} ErrorEvent
 * @property {'error'} type
 * @property {string} character
 * @property {string} message
 */

/**
 * @typedef {Object} CompleteEvent
 * @property {'complete'} type
 * @property {boolean} aborted
 * @property {FailedFile[] | undefined} failed
 */

/**
 * @typedef {ProgressEvent | ErrorEvent | CompleteEvent} DownloadEvent
 */

/**
 * @typedef {Object} VersionedCharacter
 * @property {string} name
 * @property {number} version
 */

export {};