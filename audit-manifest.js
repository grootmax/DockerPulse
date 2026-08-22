import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

/**
 * Parse manifest files list from Makefile content.
 *
 * @param {string} makefileContent - The content of the Makefile.
 * @returns {string[]} Array of file/directory paths in the MANIFEST.
 */
export function parseManifestFromMakefile(makefileContent) {
    const match = makefileContent.match(/^MANIFEST\s*[:?]?=\s*(.+)$/m);
    if (!match) {
        throw new Error('Could not find MANIFEST variable in Makefile');
    }
    return match[1].trim().split(/\s+/);
}

/**
 * Audit staged output directory against manifest list.
 *
 * @param {string} stageDir - Path to staged directory.
 * @param {string[]} manifestFiles - List of manifest files.
 * @returns {{ success: boolean, errors: string[] }} Result object containing success status and list of errors.
 */
export function auditStagedDirectory(stageDir, manifestFiles) {
    if (!fs.existsSync(stageDir)) {
        return {
            success: false,
            errors: [`Staged directory '${stageDir}' does not exist.`]
        };
    }

    const errors = [];
    for (const file of manifestFiles) {
        const filePath = path.join(stageDir, file);
        if (!fs.existsSync(filePath)) {
            errors.push(`Missing manifest-listed file/directory in staged output: '${file}'`);
        }
    }

    if (manifestFiles.includes('schemas')) {
        const xmlPath = path.join(stageDir, 'schemas', 'org.gnome.shell.extensions.dockerpulse.gschema.xml');
        const compiledPath = path.join(stageDir, 'schemas', 'gschemas.compiled');
        if (!fs.existsSync(xmlPath)) {
            errors.push(`Missing schema XML file in staged output: 'schemas/org.gnome.shell.extensions.dockerpulse.gschema.xml'`);
        }
        if (!fs.existsSync(compiledPath)) {
            errors.push(`Missing compiled schema file in staged output: 'schemas/gschemas.compiled'`);
        }
    }

    return {
        success: errors.length === 0,
        errors
    };
}

/**
 * Main execution function for CLI audit.
 */
function run() {
    const rootDir = process.cwd();
    const makefilePath = path.join(rootDir, 'Makefile');
    const stageDir = path.join(rootDir, 'build_staging');

    if (!fs.existsSync(makefilePath)) {
        console.error(`❌ Makefile not found at ${makefilePath}`);
        process.exit(1);
    }

    const makefileContent = fs.readFileSync(makefilePath, 'utf8');
    let manifestFiles;
    try {
        manifestFiles = parseManifestFromMakefile(makefileContent);
    } catch (err) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
    }

    console.log('📋 Manifest files defined in Makefile:', manifestFiles.join(', '));
    const result = auditStagedDirectory(stageDir, manifestFiles);

    if (!result.success) {
        console.error('❌ Build artifact audit failed:');
        for (const err of result.errors) {
            console.error(`   - ${err}`);
        }
        process.exit(1);
    }

    console.log('✅ Build artifact audit passed: All manifest-listed files and compiled schemas are present in staged directory.');
}

if (process.argv[1] && (process.argv[1] === __filename || process.argv[1].endsWith('audit-manifest.js'))) {
    run();
}
