import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { findProjectRoot } from '../../utils/project_context.js';
import { FastlbsError } from '../../utils/cli_error.js';
import {
    assertValidLambdaName,
    assertValidLocale,
    parseLocalesList,
} from '../../utils/cli_validation.js';
import {
    getProjectI18nConfig,
    resolveI18nSettings,
    updateProjectDefaultLocale,
    getExistingLambdaLocales,
    scaffoldLambdaI18n,
    patchHandlerWithI18n,
    registerLambdaI18n,
    ensureProjectI18nSupport,
} from '../../services/i18n/i18n_scaffolder.js';
import { checkProjectI18n } from '../../services/i18n/i18n_checker.js';

function discoverLambdasInProject(projectRoot) {
    const lambdasDir = path.join(projectRoot, 'lambdas');
    if (!fs.existsSync(lambdasDir)) return [];
    return fs
        .readdirSync(lambdasDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name !== '__doc__' && !d.name.startsWith('.'))
        .map((d) => d.name);
}

function detectLambdaKind(projectRoot, lambdaName) {
    const configPath = path.join(projectRoot, 'fastlbs.config.json');
    if (fs.existsSync(configPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const entry = cfg.lambdas?.[lambdaName];
            if (entry?.kind) return entry.kind;
        } catch {
            // ignore
        }
    }
    const indexPath = path.join(projectRoot, 'lambdas', lambdaName, 'src', 'index.ts');
    if (fs.existsSync(indexPath)) {
        const src = fs.readFileSync(indexPath, 'utf-8');
        if (/handlerAuthorizer/.test(src)) return 'authorizer';
        if (/handlerAuxiliary/.test(src)) return 'auxiliary';
    }
    return 'http';
}

export async function manageI18nCommand(lambdaName, options = {}) {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
        throw new FastlbsError('fastlbs.config.json not found in current directory or parent directories.', {
            code: 'PROJECT_ROOT_NOT_FOUND',
            hint: 'Run this command from inside a FastLBS project.',
        });
    }

    if (lambdaName) {
        assertValidLambdaName(lambdaName);
    }

    // Mode 1: Check translation keys & placeholders
    if (options.check) {
        const report = checkProjectI18n(projectRoot, lambdaName || null);
        if (report.checked === 0) {
            console.log(pc.yellow('⚠ No lambdas with i18n enabled were found in this project.'));
            return report;
        }

        for (const r of report.results) {
            if (r.ok) {
                console.log(
                    pc.green(
                        `✔ [${r.lambdaName}] All locales consistent (${r.locales?.join(', ') || ''} | ${r.totalKeys || 0} keys)`
                    )
                );
            } else {
                console.log(pc.red(`✖ [${r.lambdaName}] Translation issues found:`));
                for (const issue of r.issues) {
                    console.log(pc.red(`    - ${issue.message}`));
                }
            }
        }

        if (!report.ok) {
            throw new FastlbsError(
                `i18n check failed with ${report.totalIssues} issue(s) across ${report.checked} lambda(s).`,
                {
                    code: 'I18N_CHECK_FAILED',
                    hint: 'Ensure all locale files share the exact same keys and {{placeholder}} variables.',
                }
            );
        }

        console.log(pc.green(`\n✔ i18n check passed for ${report.checked} lambda(s).`));
        return report;
    }

    // Mode 2: Project-level default locale update (when --default is passed without a target lambda and without --all)
    if (!lambdaName && !options.all && options.default) {
        const normalizedDefault = assertValidLocale(options.default);
        const parsedLocales = options.locales ? parseLocalesList(options.locales) : null;
        const updated = updateProjectDefaultLocale(projectRoot, normalizedDefault, parsedLocales);
        await ensureProjectI18nSupport(projectRoot, {
            locales: updated.locales,
            defaultLocale: updated.defaultLocale,
            interactive: false,
        });
        console.log(
            pc.green(
                `✔ Updated project default locale to "${updated.defaultLocale}" (supported: ${updated.locales.join(', ')}) in fastlbs.config.json.`
            )
        );
        return updated;
    }

    // Determine target lambdas for scaffolding/updating
    let targets = [];
    if (options.all) {
        targets = discoverLambdasInProject(projectRoot);
        if (targets.length === 0) {
            console.log(pc.yellow('⚠ No lambdas found in the project.'));
            return { targets: [] };
        }
    } else if (lambdaName) {
        const lambdaDir = path.join(projectRoot, 'lambdas', lambdaName);
        if (!fs.existsSync(lambdaDir)) {
            throw new FastlbsError(`Lambda "${lambdaName}" was not found in lambdas/${lambdaName}.`, {
                code: 'LAMBDA_NOT_FOUND',
                hint: `Create it first with "fastlbs lambda ${lambdaName}".`,
            });
        }
        targets = [lambdaName];
    } else {
        throw new FastlbsError('Please specify a <lambda-name>, --all, --check, or --default <locale>.', {
            code: 'MISSING_I18N_TARGET',
            hint: 'Example: fastlbs i18n greeting --locales en,es,pt',
        });
    }

    if (options.default && options.all) {
        const normalizedDefault = assertValidLocale(options.default);
        const parsedLocales = options.locales ? parseLocalesList(options.locales) : null;
        updateProjectDefaultLocale(projectRoot, normalizedDefault, parsedLocales);
    }

    const projectI18n = getProjectI18nConfig(projectRoot);
    const baseSettings = resolveI18nSettings(projectRoot, {
        locales: options.locales || projectI18n.locales,
        defaultLocale: options.default || projectI18n.defaultLocale,
    });

    await ensureProjectI18nSupport(projectRoot, {
        locales: baseSettings.locales,
        defaultLocale: baseSettings.defaultLocale,
        interactive: true,
    });

    for (const targetLambda of targets) {
        const existingLocales = getExistingLambdaLocales(projectRoot, targetLambda);
        const mergedLocales = Array.from(new Set([...existingLocales, ...baseSettings.locales]));
        const kind = detectLambdaKind(projectRoot, targetLambda);

        const scaffolded = scaffoldLambdaI18n(projectRoot, targetLambda, {
            locales: mergedLocales,
            defaultLocale: baseSettings.defaultLocale,
            kind,
        });

        const indexPath = path.join(projectRoot, 'lambdas', targetLambda, 'src', 'index.ts');
        const patchResult = patchHandlerWithI18n(indexPath);

        registerLambdaI18n(projectRoot, targetLambda, {
            defaultLocale: scaffolded.defaultLocale,
            locales: scaffolded.locales,
        });

        console.log(pc.green(`✔ i18n configured for lambda "${targetLambda}"!`));
        console.log(
            pc.cyan(
                `  Locales: ${scaffolded.locales.join(', ')} (default: ${scaffolded.defaultLocale})`
            )
        );
        if (scaffolded.createdFiles.length > 0) {
            console.log(
                pc.cyan(
                    `  Created: ${scaffolded.createdFiles.map((l) => `lambdas/${targetLambda}/src/i18n/locales/${l}.json`).join(', ')}`
                )
            );
        }
        if (scaffolded.preservedFiles.length > 0) {
            console.log(
                pc.dim(
                    `  Preserved existing: ${scaffolded.preservedFiles.map((l) => `${l}.json`).join(', ')}`
                )
            );
        }

        if (patchResult.patched) {
            console.log(pc.cyan(`  Wired:   lambdas/${targetLambda}/src/index.ts (i18n registered in handler)`));
        } else if (patchResult.reason === 'already_configured') {
            console.log(pc.dim(`  Wired:   lambdas/${targetLambda}/src/index.ts (already configured)`));
        } else if (patchResult.manualSnippet) {
            console.log(
                pc.yellow(
                    `  ⚠ Could not automatically wire lambdas/${targetLambda}/src/index.ts. Add the following manually:\n${patchResult.manualSnippet}`
                )
            );
        }

        console.log(
            pc.yellow(
                `  Tip: Use event.t("greeting", { name }) inside lambdas/${targetLambda}/src/services/index.ts`
            )
        );
    }

    return { targets };
}
