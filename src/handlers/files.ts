import * as xmljs from "xml-js";
import { HandlerBase } from "./handlerbase";
import { IFile, IWebPart } from "../schema";
import { Web, File, Util, FileAddResult, Logger, LogLevel } from "sp-pnp-js";
import { ReplaceTokens } from "../util";

/**
 * Describes the Features Object Handler
 */
export class Files extends HandlerBase {
    /**
     * Creates a new instance of the Files class
     */
    constructor() {
        super("Files");
    }

    /**
     * Provisioning Files
     *
     * @param {Web} web The web
     * @param {IFile[]} files The files  to provision
     */
    public async ProvisionObjects(web: Web, files: IFile[]): Promise<void> {
        super.scope_started();
        if (typeof window === "undefined") {
            throw "Files Handler not supported in Node.";
        }
        const { ServerRelativeUrl } = await web.get();
        try {
            await files.reduce((chain, file) => chain.then(_ => this.processFile(web, file, ServerRelativeUrl)), Promise.resolve());
            super.scope_ended();
        } catch (err) {
            super.scope_ended();
        }
    }

    /**
     * Get blob for a file
     *
     * @param {IFile} file The file
     */
    private async getFileBlob(file: IFile): Promise<Blob> {
        const fileSrcWithoutTokens = ReplaceTokens(file.Src);
        const response = await fetch(fileSrcWithoutTokens, { credentials: "include", method: "GET" });
        const fileContents = await response.text();
        const blob = new Blob([fileContents], { type: "text/plain" });
        return blob;
    }

    /**
     * Procceses a file
     *
     * @param {Web} web The web
     * @param {IFile} file The file
     * @param {string} webServerRelativeUrl ServerRelativeUrl for the web
     */
    private async processFile(web: Web, file: IFile, webServerRelativeUrl: string): Promise<void> {
        Logger.log({ data: file, level: LogLevel.Info, message: `Processing file ${file.Folder}/${file.Url}` });
        try {
            const blob = await this.getFileBlob(file);
            const folderServerRelativeUrl = Util.combinePaths("/", webServerRelativeUrl, file.Folder);
            const pnpFolder = web.getFolderByServerRelativeUrl(folderServerRelativeUrl);

            let fileServerRelativeUrl = Util.combinePaths("/", folderServerRelativeUrl, file.Url);
            let fileAddResult: FileAddResult;
            let pnpFile: File;
            try {
                fileAddResult = await pnpFolder.files.add(file.Url, blob, file.Overwrite);
                pnpFile = fileAddResult.file;
                fileServerRelativeUrl = fileAddResult.data.ServerRelativeUrl;
            } catch (fileAddError) {
                pnpFile = web.getFileByServerRelativePath(fileServerRelativeUrl);
            }
            await Promise.all([
                this.processWebParts(file, webServerRelativeUrl, fileServerRelativeUrl),
                this.processProperties(web, pnpFile, file.Properties),
            ]);
            await this.processPageListViews(web, file.WebParts, fileServerRelativeUrl);
        } catch (err) {
            throw err;
        }

    }

    /**
     * Remove exisiting webparts if specified
     *
     * @param {string} webServerRelativeUrl ServerRelativeUrl for the web
     * @param {string} fileServerRelativeUrl ServerRelativeUrl for the file
     * @param {boolean} shouldRemove Should web parts be removed
     */
    private removeExistingWebParts(webServerRelativeUrl: string, fileServerRelativeUrl: string, shouldRemove: boolean) {
        return new Promise((resolve, reject) => {
            if (shouldRemove) {
                Logger.log({
                    data: { webServerRelativeUrl, fileServerRelativeUrl },
                    level: LogLevel.Info,
                    message: `Deleting existing webpart from file ${fileServerRelativeUrl}`,
                });
                let ctx = new SP.ClientContext(webServerRelativeUrl),
                    spFile = ctx.get_web().getFileByServerRelativeUrl(fileServerRelativeUrl),
                    lwpm = spFile.getLimitedWebPartManager(SP.WebParts.PersonalizationScope.shared),
                    webParts = lwpm.get_webParts();
                ctx.load(webParts);
                ctx.executeQueryAsync(() => {
                    webParts.get_data().forEach(wp => wp.deleteWebPart());
                    ctx.executeQueryAsync(resolve, reject);
                }, reject);
            } else {
                Logger.log({
                    data: { webServerRelativeUrl, fileServerRelativeUrl },
                    level: LogLevel.Info,
                    message: `Web parts should not be removed from file ${fileServerRelativeUrl}. Resolving.`,
                });
                resolve();
            }
        });
    }

    /**
     * Processes web parts
     *
     * @param {IFile} file The file
     * @param {string} webServerRelativeUrl ServerRelativeUrl for the web
     * @param {string} fileServerRelativeUrl ServerRelativeUrl for the file
     */
    private async processWebParts(file: IFile, webServerRelativeUrl: string, fileServerRelativeUrl: string) {
        Logger.log({ level: LogLevel.Info, message: `Processing webparts for file ${file.Folder}/${file.Url}` });
        await this.removeExistingWebParts(webServerRelativeUrl, fileServerRelativeUrl, file.RemoveExistingWebParts);
        if (file.WebParts && file.WebParts.length > 0) {
            let ctx = new SP.ClientContext(webServerRelativeUrl),
                spFile = ctx.get_web().getFileByServerRelativeUrl(fileServerRelativeUrl),
                lwpm = spFile.getLimitedWebPartManager(SP.WebParts.PersonalizationScope.shared);
            await this.fetchWebPartContents(file.WebParts, (index, xml) => { file.WebParts[index].Contents.Xml = xml; });
            file.WebParts.forEach(wp => {
                const webPartXml = ReplaceTokens(wp.Contents.Xml);
                const webPartDef = lwpm.importWebPart(webPartXml);
                const webPartInstance = webPartDef.get_webPart();
                Logger.log({
                    data: { wp, webPartXml },
                    level: LogLevel.Info,
                    message: `Processing webpart ${wp.Title} for file ${file.Folder}/${file.Url}`,
                });
                lwpm.addWebPart(webPartInstance, wp.Zone, wp.Order);
                ctx.load(webPartInstance);
            });
            ctx.executeQueryAsync(() => {
                Logger.log({
                    level: LogLevel.Info,
                    message: `Successfully processed webparts for file ${file.Folder}/${file.Url}`,
                });
            }, (sender, args) => {
                Logger.log({
                    data: { error: args.get_message() },
                    level: LogLevel.Error,
                    message: `Failed to process webparts for file ${file.Folder}/${file.Url}`,
                });
                throw { sender, args };
            });
        }
    }


    /**
     * Fetches web part contents
     *
     * @param {IWebPart[]} webParts Web parts
     * @param {Function} cb Callback function that takes index of the the webpart and the retrieved XML
     */
    private fetchWebPartContents = (webParts: IWebPart[], cb: (index, xml) => void) => new Promise<any>((resolve, reject) => {
        let fileFetchPromises = webParts.map((wp, index) => {
            return (() => {
                return new Promise<any>(async (_res, _rej) => {
                    if (wp.Contents.FileSrc) {
                        const fileSrc = ReplaceTokens(wp.Contents.FileSrc);
                        Logger.log({ data: null, level: LogLevel.Info, message: `Retrieving contents from file '${fileSrc}'.` });
                        const response = await fetch(fileSrc, { credentials: "include", method: "GET" });
                        const xml = await response.text();
                        if (Util.isArray(wp.PropertyOverrides)) {
                            let obj: any = xmljs.xml2js(xml);
                            if (obj.elements[0].name === "webParts") {
                                const existingProperties = obj.elements[0].elements[0].elements[1].elements[0].elements;
                                let updatedProperties = [];
                                existingProperties.forEach(prop => {
                                    let hasOverride = wp.PropertyOverrides.filter(po => po.name === prop.attributes.name).length > 0;
                                    if (!hasOverride) {
                                        updatedProperties.push(prop);
                                    }
                                });
                                wp.PropertyOverrides.forEach(({ name, type, value }) => {
                                    updatedProperties.push({
                                        attributes: {
                                            name,
                                            type,
                                        },
                                        elements: [
                                            {
                                                text: value,
                                                type: "text",
                                            },
                                        ],
                                        name: "property",
                                        type: "element",
                                    });
                                });
                                obj.elements[0].elements[0].elements[1].elements[0].elements = updatedProperties;
                                cb(index, xmljs.js2xml(obj));
                                _res();
                            } else {
                                cb(index, xml);
                                _res();
                            }
                        } else {
                            cb(index, xml);
                            _res();
                        }
                    } else {
                        _res();
                    }
                });
            })();
        });
        Promise.all(fileFetchPromises)
            .then(resolve)
            .catch(reject);
    })

    /**
     * Processes page list views
     *
     * @param {Web} web The web
     * @param {IWebPart[]} webParts Web parts
     * @param {string} fileServerRelativeUrl ServerRelativeUrl for the file
     */
    private processPageListViews(web: Web, webParts: IWebPart[], fileServerRelativeUrl: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (webParts) {
                Logger.log({
                    data: { webParts, fileServerRelativeUrl },
                    level: LogLevel.Info,
                    message: `Processing page list views for file ${fileServerRelativeUrl}`,
                });
                let listViewWebParts = webParts.filter(wp => wp.ListView);
                if (listViewWebParts.length > 0) {
                    listViewWebParts
                        .reduce((chain, wp) => chain.then(_ => this.processPageListView(web, wp.ListView, fileServerRelativeUrl)), Promise.resolve())
                        .then(() => {
                            Logger.log({
                                data: {},
                                level: LogLevel.Info,
                                message: `Successfully processed page list views for file ${fileServerRelativeUrl}`,
                            });
                            resolve();
                        })
                        .catch(err => {
                            Logger.log({
                                data: { err, fileServerRelativeUrl },
                                level: LogLevel.Error,
                                message: `Failed to process page list views for file ${fileServerRelativeUrl}`,
                            });
                            reject(err);
                        });
                } else {
                    resolve();
                }
            } else {
                resolve();
            }
        });
    }

    /**
     * Processes page list view
     *
     * @param {Web} web The web
     * @param {any} listView List view
     * @param {string} fileServerRelativeUrl ServerRelativeUrl for the file
     */
    private processPageListView(web: Web, listView, fileServerRelativeUrl: string) {
        return new Promise<void>((resolve, reject) => {
            let views = web.lists.getByTitle(listView.List).views;
            views.get()
                .then(listViews => {
                    let wpView = listViews.filter(v => v.ServerRelativeUrl === fileServerRelativeUrl);
                    if (wpView.length === 1) {
                        let view = views.getById(wpView[0].Id);
                        let settings = listView.View.AdditionalSettings || {};
                        view.update(settings)
                            .then(() => {
                                view.fields.removeAll()
                                    .then(_ => {
                                        listView.View.ViewFields.reduce((chain, viewField) => chain.then(() => view.fields.add(viewField)), Promise.resolve())
                                            .then(resolve)
                                            .catch(err => {
                                                Logger.log({
                                                    data: { fileServerRelativeUrl, listView, err },
                                                    level: LogLevel.Error,
                                                    message: `Failed to process page list view for file ${fileServerRelativeUrl}`,
                                                });
                                                reject(err);
                                            });
                                    })
                                    .catch(err => {
                                        Logger.log({
                                            data: { fileServerRelativeUrl, listView, err },
                                            level: LogLevel.Error,
                                            message: `Failed to process page list view for file ${fileServerRelativeUrl}`,
                                        });
                                        reject(err);
                                    });
                            })
                            .catch(err => {
                                Logger.log({
                                    data: { fileServerRelativeUrl, listView, err },
                                    level: LogLevel.Error,
                                    message: `Failed to process page list view for file ${fileServerRelativeUrl}`,
                                });
                                reject(err);
                            });
                    } else {
                        resolve();
                    }
                })
                .catch(err => {
                    Logger.log({
                        data: { fileServerRelativeUrl, listView, err },
                        level: LogLevel.Error,
                        message: `Failed to process page list view for file ${fileServerRelativeUrl}`,
                    });
                    reject(err);
                });
        });
    }

    /**
     * Process list item properties for the file
     *
     * @param {Web} web The web
     * @param {File} pnpFile The PnP file
     * @param {Object} properties The properties to set
     */
    private async processProperties(web: Web, pnpFile: File, properties: { [key: string]: string | number }) {
        if (properties && Object.keys(properties).length > 0) {
            const listItemAllFields = await pnpFile.listItemAllFields.select("ID", "ParentList/ID").expand("ParentList").get();
            await web.lists.getById(listItemAllFields.ParentList.Id).items.getById(listItemAllFields.ID).update(properties);
        }
    }

}
