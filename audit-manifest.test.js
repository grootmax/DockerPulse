import fs from 'fs';
import path from 'path';
import { parseManifestFromMakefile, auditStagedDirectory } from './audit-manifest.js';

describe('Manifest Audit Verification', () => {
    const testStageDir = path.join(process.cwd(), 'tmp_test_staging');

    beforeEach(() => {
        if (fs.existsSync(testStageDir)) {
            fs.rmSync(testStageDir, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(testStageDir)) {
            fs.rmSync(testStageDir, { recursive: true, force: true });
        }
    });

    test('should parse MANIFEST variable from Makefile', () => {
        const sampleMakefile = `
UUID = test@example.com
MANIFEST = extension.js prefs.js processRegistry.js metadata.json stylesheet.css parent_monitor_wrapper.py schemas

all: compile
`;
        const manifest = parseManifestFromMakefile(sampleMakefile);
        expect(manifest).toEqual([
            'extension.js',
            'prefs.js',
            'processRegistry.js',
            'metadata.json',
            'stylesheet.css',
            'parent_monitor_wrapper.py',
            'schemas'
        ]);
    });

    test('should throw error if MANIFEST variable is missing in Makefile', () => {
        const badMakefile = `UUID = test@example.com\nall: compile\n`;
        expect(() => parseManifestFromMakefile(badMakefile)).toThrow('Could not find MANIFEST variable in Makefile');
    });

    test('should fail audit if staged directory does not exist', () => {
        const result = auditStagedDirectory(testStageDir, ['extension.js']);
        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain("Staged directory");
    });

    test('should fail audit if a manifest file is missing from staged directory', () => {
        fs.mkdirSync(testStageDir, { recursive: true });
        fs.writeFileSync(path.join(testStageDir, 'extension.js'), '// extension');

        const manifest = ['extension.js', 'processRegistry.js', 'parent_monitor_wrapper.py'];
        const result = auditStagedDirectory(testStageDir, manifest);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBe(2);
        expect(result.errors[0]).toContain("Missing manifest-listed file/directory in staged output: 'processRegistry.js'");
        expect(result.errors[1]).toContain("Missing manifest-listed file/directory in staged output: 'parent_monitor_wrapper.py'");
    });

    test('should pass audit when all manifest files and compiled schemas are present', () => {
        fs.mkdirSync(path.join(testStageDir, 'schemas'), { recursive: true });
        fs.writeFileSync(path.join(testStageDir, 'extension.js'), '// extension');
        fs.writeFileSync(path.join(testStageDir, 'prefs.js'), '// prefs');
        fs.writeFileSync(path.join(testStageDir, 'processRegistry.js'), '// processRegistry');
        fs.writeFileSync(path.join(testStageDir, 'metadata.json'), '{}');
        fs.writeFileSync(path.join(testStageDir, 'stylesheet.css'), '');
        fs.writeFileSync(path.join(testStageDir, 'parent_monitor_wrapper.py'), '# python');
        fs.writeFileSync(path.join(testStageDir, 'schemas', 'org.gnome.shell.extensions.dockerpulse.gschema.xml'), '<xml/>');
        fs.writeFileSync(path.join(testStageDir, 'schemas', 'gschemas.compiled'), 'compiled');

        const manifest = [
            'extension.js',
            'prefs.js',
            'processRegistry.js',
            'metadata.json',
            'stylesheet.css',
            'parent_monitor_wrapper.py',
            'schemas'
        ];

        const result = auditStagedDirectory(testStageDir, manifest);
        expect(result.success).toBe(true);
        expect(result.errors.length).toBe(0);
    });
});
