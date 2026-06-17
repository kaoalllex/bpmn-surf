// Orchestrates the DMN differ page: wires the view, the dmn-js viewer,
// the diagram versions and the decision table diff highlighting together
class DmnDiffer {
    static MSG_ID = 'msg_dmn_71e23e639965407fb9c87f100a56c898';

    static OLD_VERSION_XMLNS = "http://www.omg.org/spec/DMN/20151101/dmn.xsd";
    static NEW_VERSION_XMLNS = "https://www.omg.org/spec/DMN/20191111/MODEL/";

    #rawParams;
    #params = null;
    #versions = null;
    #branchIndicator = null;
    #viewport = null;
    #view = null;

    #dmnJS = null;
    #xmlComparator = null;
    #diffPainter = null;

    constructor(rawParams) {
        this.#rawParams = rawParams;
    }

    async show() {
        console.debug('diff params: ', this.#rawParams);
        this.#init();
        console.debug('init done');

        this.#view.build();
        // console.debug('dmn div created');

        this.#dmnJS = new DmnJS({
            container: '#' + DmnDifferView.CANVAS_ID
        });
        // console.debug('dmn js created');

        await this.#loadVersions();

        if (!this.#versions.branchXml && !this.#versions.mrXml) {
            // File absent in both versions (BUG-0001): show a placeholder instead
            // of a blank page. The detailed error is logged by #loadVersions().
            this.#view.showEmptyState('File does not exist in either version');
            this.#view.setDownloadButtonEnabled(false);
            return;
        }

        if (this.#versions.mrXml) {
            await this.#showMr();
        } else {
            await this.#showBranch();
        }

        // console.debug('making canvas visible...');
        this.#view.showCanvas();

        console.debug('ready!');
    }

    #init() {
        this.#params = new DifferParams(this.#rawParams);

        this.#versions = new DiagramVersions(this.#params);
        this.#branchIndicator = new BranchIndicator(this.#params.targetLabel, this.#params.sourceLabel);
        this.#viewport = new DmnTableViewport();
        this.#xmlComparator = new DmnXmlComparator();
        this.#diffPainter = new DmnDiffPainter();
        this.#view = new DmnDifferView(this.#params, this.#branchIndicator, this.#viewport, {
            onDownload: () => this.#downloadShownBranchFile(),
            onSwitchBranch: () => this.#switchBranch()
        });
    }

    async #loadVersions() {
        console.debug('loading branch dmn xml...');
        await this.#versions.loadBranchXml();

        if (this.#params.sourceRef) {
            console.debug('loading mr dmn xml...');
            await this.#versions.loadMrXml();
        } else if (this.#params.localFileContent) {
            console.debug('using local file context as mr');
            this.#versions.useLocalFileContentAsMr();
        } else {
            console.debug('mr commit id is undefined');
        }

        if (!this.#versions.branchXml && !this.#versions.mrXml) {
            console.error(
                'dmn file is unavailable in both versions;',
                `target branch url: ${this.#params.rawFileUrl(this.#params.targetRef)};`,
                `mr url: ${this.#params.sourceRef ? this.#params.rawFileUrl(this.#params.sourceRef) : '<no sourceRef>'}`
            );
        }
    }

    #downloadShownBranchFile() {
        if (this.#branchIndicator.isTargetBranchShown()) {
            this.#versions.download(this.#versions.branchXml, this.#params.targetLabel, this.#params.targetFileName);
        } else {
            this.#versions.download(this.#versions.mrXml, this.#params.sourceLabel, this.#params.fileName);
        }
    }

    #switchBranch() {
        if (this.#branchIndicator.isTargetBranchShown()) { // Current branch - switch to MR
            if (this.#versions.mrXml) {
                this.#showMr();
            } else {
                // File is absent in the MR/source version (deleted in this MR)
                this.#showAbsentSide(false);
            }
        } else { // Current MR - try to switch to branch
            if (this.#versions.branchXml) {
                this.#showBranch();
            } else {
                // File is absent in the target version (new file in this MR)
                this.#showAbsentSide(true);
            }
        }
    }

    // Switches to a side where the file does not exist: marks the absence in the
    // branch label and covers the canvas with a blank placeholder (dmn-js has no
    // clear()), keeping the toolbar usable to switch back (UX-0003).
    #showAbsentSide(targetSide) {
        this.#view.setFileName(targetSide ? this.#params.targetFileName : this.#params.fileName);
        this.#branchIndicator.setAbsentLabel(targetSide);
        this.#view.showEmptyState('');
        this.#view.setDownloadButtonEnabled(false);
    }

    async #showMr() {
        console.debug('showing mr dmn xml file...');
        const mrXml = requireDefined(this.#versions.mrXml, 'mrDmnXml');
        await this.#showXml(mrXml);
        this.#view.setFileName(this.#params.fileName);
        this.#branchIndicator.setShownLabel(this.#params.sourceLabel);

        if (this.#versions.branchXml) {
            this.#highlightDiffs(mrXml, this.#versions.branchXml, DiffType.ADD);
        } else {
            console.debug('file not exists in target branch');
        }
    }

    async #showBranch() {
        console.debug('showing branch dmn xml file...');
        const branchXml = requireDefined(this.#versions.branchXml, 'branchDmnXml');
        await this.#showXml(branchXml);
        this.#view.setFileName(this.#params.targetFileName);
        this.#branchIndicator.setShownLabel(this.#params.targetLabel);

        if (this.#versions.mrXml) {
            this.#highlightDiffs(branchXml, this.#versions.mrXml, DiffType.REMOVE);
        } else {
            console.debug('file not exists in MR branch');
        }
    }

    async #showXml(dmnXml) {
        // This side has a diagram/file — hide the absent-side placeholder and
        // re-enable Download (disabled while an absent side is shown).
        this.#view.hideEmptyState();
        this.#view.setDownloadButtonEnabled(true);

        const scrollTop = this.#viewport.scrollTop;
        // console.debug('scroll top: ' + scrollTop);

        this.#viewport.reset();
        try {
            // replace xmlns because the viewer dont want to show the old versions of dmn
            const fixedXml = dmnXml.replace(DmnDiffer.OLD_VERSION_XMLNS, DmnDiffer.NEW_VERSION_XMLNS);
            const result = await this.#dmnJS.importXML(fixedXml);
            // const { warnings } = result;
            // console.debug('dmn schema loaded succesfully', warnings);
        } catch (err) {
            console.error('dmn loading error', err);
            return;
        }
        this.#switchToViewTableMode();
        this.#hidePoweredByLabel();
        this.#viewport.fit();
        this.#viewport.scrollTop = scrollTop;
    }

    #highlightDiffs(myXml, otherXml, diffTypeForMissing) {
        // console.debug('highlight diffs...');
        const diff = this.#xmlComparator.compare(myXml, otherXml);
        this.#diffPainter.paint(diff, diffTypeForMissing);
    }

    #hidePoweredByLabel() {
        try {
            document.querySelector('.bjs-powered-by').style.display = 'none';
        } catch (error) {
            console.warn('powered by label not found', error);
        }
    }

    async #switchToViewTableMode() {
        const switchToTableButton = document.querySelector('.dmn-icon-decision-table');
        if (switchToTableButton) {
            switchToTableButton.click();
        }

        const viewDrdButton = await doWithAttempts(function () {
            return document.querySelector('.view-drd');
        }, 2, 50);
        if (viewDrdButton) {
            viewDrdButton.style.display = 'none';
        }
    }
}

function main() {
    appendTimeToConsoleLogs();

    window.addEventListener('message', async function (msg) {
        // console.debug('message received', msg);
        if (msg.origin !== window.origin || msg.data.id !== DmnDiffer.MSG_ID) {
            console.debug(`skip message: msg.origin = ${msg.origin}; msg.data.id = ${msg.data.id}`);
            return;
        }
        console.debug('showing dmn differ...');
        await new DmnDiffer(msg.data.params).show();
    });
}

main();
