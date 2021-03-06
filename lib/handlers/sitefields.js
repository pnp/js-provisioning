var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import * as xmljs from 'xml-js';
import { HandlerBase } from "./handlerbase";
import { TokenHelper } from '../util/tokenhelper';
/**
 * Describes the Site Fields Object Handler
 */
var SiteFields = (function (_super) {
    __extends(SiteFields, _super);
    /**
     * Creates a new instance of the ObjectSiteFields class
     */
    function SiteFields(config) {
        return _super.call(this, "SiteFields", config) || this;
    }
    /**
     * Provisioning Client Side Pages
     *
     * @param {Web} web The web
     * @param {string[]} siteFields The site fields
     * @param {ProvisioningContext} context Provisioning context
     */
    SiteFields.prototype.ProvisionObjects = function (web, siteFields, context) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            var _a, err_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.context = context;
                        this.tokenHelper = new TokenHelper(this.context, this.config);
                        _super.prototype.scope_started.call(this);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        _a = this.context;
                        return [4 /*yield*/, web.fields.select('Id', 'InternalName').get()];
                    case 2:
                        _a.siteFields = (_b.sent()).reduce(function (obj, l) {
                            obj[l.InternalName] = l.Id;
                            return obj;
                        }, {});
                        return [4 /*yield*/, siteFields.reduce(function (chain, schemaXml) { return chain.then(function () { return _this.processSiteField(web, schemaXml); }); }, Promise.resolve())];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        err_1 = _b.sent();
                        _super.prototype.scope_ended.call(this);
                        throw err_1;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Provision a site field
     *
     * @param {Web} web The web
     * @param {IClientSidePage} clientSidePage Cient side page
     */
    SiteFields.prototype.processSiteField = function (web, schemaXml) {
        return __awaiter(this, void 0, void 0, function () {
            var schemaXmlJson, _a, DisplayName, Name, err_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 5, , 6]);
                        schemaXml = this.tokenHelper.replaceTokens(schemaXml);
                        schemaXmlJson = JSON.parse(xmljs.xml2json(schemaXml));
                        _a = schemaXmlJson.elements[0].attributes, DisplayName = _a.DisplayName, Name = _a.Name;
                        if (!this.context.siteFields[Name]) return [3 /*break*/, 2];
                        _super.prototype.log_info.call(this, "processSiteField", "Updating site field " + DisplayName);
                        return [4 /*yield*/, web.fields.getByInternalNameOrTitle(Name).update({ SchemaXml: schemaXml })];
                    case 1: return [2 /*return*/, _b.sent()];
                    case 2:
                        _super.prototype.log_info.call(this, "processSiteField", "Adding site field " + DisplayName);
                        return [4 /*yield*/, web.fields.createFieldAsXml(schemaXml)];
                    case 3: return [2 /*return*/, _b.sent()];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        err_2 = _b.sent();
                        throw err_2;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    return SiteFields;
}(HandlerBase));
export { SiteFields };
