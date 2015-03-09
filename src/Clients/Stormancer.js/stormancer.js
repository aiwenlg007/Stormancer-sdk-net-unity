/// <reference path="Scripts/typings/msgpack/msgpack.d.ts" />
/// <reference path="CancellationTokenSource.ts" />
// Module
var Stormancer;
(function (Stormancer) {
    var MessageIDTypes = (function () {
        function MessageIDTypes() {
        }
        MessageIDTypes.ID_CONNECT_TO_SCENE = 134;
        MessageIDTypes.ID_DISCONNECT_FROM_SCENE = 135;
        MessageIDTypes.ID_GET_SCENE_INFOS = 136;
        MessageIDTypes.ID_REQUEST_RESPONSE_MSG = 137;
        MessageIDTypes.ID_REQUEST_RESPONSE_COMPLETE = 138;
        MessageIDTypes.ID_REQUEST_RESPONSE_ERROR = 139;
        MessageIDTypes.ID_CONNECTION_RESULT = 140;
        MessageIDTypes.ID_SCENES = 141;
        return MessageIDTypes;
    })();
    Stormancer.MessageIDTypes = MessageIDTypes;
    var jQueryWrapper = (function () {
        function jQueryWrapper() {
        }
        jQueryWrapper.initWrapper = function (jquery) {
            jQueryWrapper.$ = jquery;
        };
        return jQueryWrapper;
    })();
    Stormancer.jQueryWrapper = jQueryWrapper;
    // Available packet priorities
    (function (PacketPriority) {
        // The packet is sent immediately without aggregation.
        PacketPriority[PacketPriority["IMMEDIATE_PRIORITY"] = 0] = "IMMEDIATE_PRIORITY";
        // The packet is sent at high priority level.
        PacketPriority[PacketPriority["HIGH_PRIORITY"] = 1] = "HIGH_PRIORITY";
        // The packet is sent at medium priority level.
        PacketPriority[PacketPriority["MEDIUM_PRIORITY"] = 2] = "MEDIUM_PRIORITY";
        // The packet is sent at low priority level.
        PacketPriority[PacketPriority["LOW_PRIORITY"] = 3] = "LOW_PRIORITY";
    })(Stormancer.PacketPriority || (Stormancer.PacketPriority = {}));
    var PacketPriority = Stormancer.PacketPriority;
    /// Different available reliability levels when sending a packet.
    (function (PacketReliability) {
        /// The packet may be lost, or arrive out of order. There are no guarantees whatsoever.
        PacketReliability[PacketReliability["UNRELIABLE"] = 0] = "UNRELIABLE";
        /// The packets arrive in order, but may be lost. If a packet arrives out of order, it is discarded.
        /// The last packet may also never arrive.
        PacketReliability[PacketReliability["UNRELIABLE_SEQUENCED"] = 1] = "UNRELIABLE_SEQUENCED";
        /// The packets always reach destination, but may do so out of order.
        PacketReliability[PacketReliability["RELIABLE"] = 2] = "RELIABLE";
        /// The packets always reach destination and in order.
        PacketReliability[PacketReliability["RELIABLE_ORDERED"] = 3] = "RELIABLE_ORDERED";
        /// The packets arrive at destination in order. If a packet arrive out of order, it is ignored.
        /// That mean that packets may disappear, but the last one always reach destination.
        PacketReliability[PacketReliability["RELIABLE_SEQUENCED"] = 4] = "RELIABLE_SEQUENCED";
    })(Stormancer.PacketReliability || (Stormancer.PacketReliability = {}));
    var PacketReliability = Stormancer.PacketReliability;
    (function (ConnectionState) {
        ConnectionState[ConnectionState["Disconnected"] = 0] = "Disconnected";
        ConnectionState[ConnectionState["Connecting"] = 1] = "Connecting";
        ConnectionState[ConnectionState["Connected"] = 2] = "Connected";
    })(Stormancer.ConnectionState || (Stormancer.ConnectionState = {}));
    var ConnectionState = Stormancer.ConnectionState;
    // Represents the configuration of a Stormancer client.
    var Configuration = (function () {
        function Configuration() {
            this._metadata = {};
            //this.dispatcher = new DefaultPacketDispatcher();
            //this.transport = new RaknetTransport(NullLogger.Instance);
            this.serializers = [];
            this.serializers.push(new MsgPackSerializer());
        }
        Configuration.prototype.getApiEndpoint = function () {
            if (this.isLocalDev) {
                return this.serverEndpoint ? this.serverEndpoint : Configuration.localDevEndpoint;
            }
            else {
                return this.serverEndpoint ? this.serverEndpoint : Configuration.apiEndpoint;
            }
        };
        // Creates a ClientConfiguration object targeting the local development server.
        Configuration.forLocalDev = function (applicationName) {
            var config = new Configuration();
            config.isLocalDev = true;
            config.application = applicationName;
            config.account = "local";
            return config;
        };
        // Creates a ClientConfiguration object targeting the public online platform.
        Configuration.forAccount = function (accountId, applicationName) {
            var config = new Configuration();
            config.isLocalDev = false;
            config.account = accountId;
            config.application = applicationName;
            return config;
        };
        // Adds metadata to the connection.
        Configuration.prototype.Metadata = function (key, value) {
            this._metadata[key] = value;
            return this;
        };
        Configuration.apiEndpoint = "http://api.stormancer.com/";
        Configuration.localDevEndpoint = "http://localhost:8081/";
        return Configuration;
    })();
    Stormancer.Configuration = Configuration;
    var Client = (function () {
        function Client(config) {
            this._tokenHandler = new TokenHandler();
            this._serializers = {};
            this._systemSerializer = new MsgPackSerializer();
            this._accountId = config.account;
            this._applicationName = config.application;
            this._apiClient = new ApiClient(config, this._tokenHandler);
            this._transport = config.transport;
            this._dispatcher = config.dispatcher;
            this._requestProcessor = new RequestProcessor(this._logger, []);
            this._scenesDispatcher = new SceneDispatcher();
            this._dispatcher.addProcessor(this._requestProcessor);
            this._dispatcher.addProcessor(this._scenesDispatcher);
            this._metadata = config._metadata;
            for (var i in config.serializers) {
                var serializer = config.serializers[i];
                this._serializers[serializer.name] = serializer;
            }
            this._metadata["serializers"] = Helpers.mapKeys(this._serializers).join(',');
            this._metadata["transport"] = this._transport.name;
            this._metadata["version"] = "1.0.0a";
            this._metadata["platform"] = "JS";
            this.initialize();
        }
        Client.prototype.initialize = function () {
            var _this = this;
            if (!this._initialized) {
                this._initialized = true;
                var previous = this._transport.packetReceived;
                this._transport.packetReceived = previous ? (function (packet) {
                    previous(packet);
                    _this.transport_packetReceived(packet);
                }) : this.transport_packetReceived;
            }
        };
        Client.prototype.transport_packetReceived = function (packet) {
            this._dispatcher.dispatchPacket(packet);
        };
        Client.prototype.getPublicScene = function (sceneId, userData) {
            var _this = this;
            return this._apiClient.getSceneEndpoint(this._accountId, this._applicationName, sceneId, userData).then(function (ci) { return _this.getSceneImpl(sceneId, ci); });
        };
        Client.prototype.getScene = function (token) {
            var ci = this._tokenHandler.decodeToken(token);
            return this.getSceneImpl(ci.tokenData.sceneId, ci);
        };
        Client.prototype.getSceneImpl = function (sceneId, ci) {
            var _this = this;
            return this.ensureTransportStarted(ci).then(function () {
                var parameter = { Metadata: _this._serverConnection.metadata, Token: ci.token };
                return _this.sendSystemRequest(MessageIDTypes.ID_GET_SCENE_INFOS, parameter);
            }).then(function (result) {
                if (!_this._serverConnection.serializer) {
                    if (!result.SelectedSerializer) {
                        throw new Error("No serializer selected.");
                    }
                    _this._serverConnection.serializer = _this._serializers[result.SelectedSerializer];
                    _this._serverConnection.metadata["serializer"] = result.SelectedSerializer;
                }
                var scene = new Scene(_this._serverConnection, _this, sceneId, ci.token, result);
                return scene;
            });
        };
        Client.prototype.sendSystemRequest = function (id, parameter) {
            var _this = this;
            return this._requestProcessor.sendSystemRequest(this._serverConnection, id, this._systemSerializer.serialize(parameter)).then(function (packet) { return _this._systemSerializer.deserialize(packet.data); });
        };
        Client.prototype.ensureTransportStarted = function (ci) {
            var _this = this;
            return Helpers.promiseIf(this._serverConnection == null, function () {
                return Helpers.promiseIf(!_this._transport.isRunning, _this.startTransport).then(function () {
                    return _this._transport.connect(ci.tokenData.endpoints[_this._transport.name]).then(_this.registerConnection);
                });
            });
        };
        Client.prototype.startTransport = function () {
            this._cts = new Cancellation.tokenSource();
            return this._transport.start("client", new ConnectionHandler(), this._cts.token, null, 50);
        };
        Client.prototype.registerConnection = function (connection) {
            this._serverConnection = connection;
            for (var key in this._metadata) {
                this._serverConnection.metadata[key] = this._metadata[key];
            }
        };
        Client.prototype.disconnectScene = function (scene, sceneHandle) {
            var _this = this;
            return this.sendSystemRequest(MessageIDTypes.ID_DISCONNECT_FROM_SCENE, sceneHandle).then(function () { return _this._scenesDispatcher.removeScene(sceneHandle); });
        };
        Client.prototype.disconnect = function () {
            if (this._serverConnection) {
                this._serverConnection.close();
            }
        };
        Client.prototype.connectToScene = function (scene, token, localRoutes) {
            var parameter = {
                Token: token,
                Routes: [],
                ConnectionMetadata: this._serverConnection.metadata
            };
            for (var i = 0; i < localRoutes.length; i++) {
                var r = localRoutes[i];
                parameter.Routes.push({
                    Handle: r.index,
                    Metadata: r.metadata,
                    Name: r.name
                });
            }
            return this.sendSystemRequest(MessageIDTypes.ID_CONNECT_TO_SCENE, parameter).then(function (result) {
                throw "Not implemented";
            });
        };
        return Client;
    })();
    Stormancer.Client = Client;
    var ConnectionHandler = (function () {
        function ConnectionHandler() {
            this._current = 0;
        }
        // Generates an unique connection id for this node.
        ConnectionHandler.prototype.generateNewConnectionId = function () {
            return this._current++;
        };
        // Adds a connection to the manager
        ConnectionHandler.prototype.newConnection = function (connection) {
        };
        // Returns a connection by id.
        ConnectionHandler.prototype.getConnection = function (id) {
            throw new Error("Not implemented.");
        };
        // Closes the target connection.
        ConnectionHandler.prototype.closeConnection = function (connection, reason) {
        };
        return ConnectionHandler;
    })();
    Stormancer.ConnectionHandler = ConnectionHandler;
    var Packet = (function () {
        function Packet(source, data, metadata) {
            this.source = source;
            this.data = data;
            this.metadata = metadata;
        }
        Packet.prototype.getMetadata = function (key) {
            return this.metadata[key];
        };
        return Packet;
    })();
    var SceneDispatcher = (function () {
        function SceneDispatcher() {
            this._scenes = [];
        }
        SceneDispatcher.prototype.registerProcessor = function (config) {
            config.addCatchAllProcessor(this.handler);
        };
        SceneDispatcher.prototype.handler = function (sceneHandler, packet) {
            if (sceneHandler < MessageIDTypes.ID_SCENES) {
                return false;
            }
            var scene = this._scenes[sceneHandler - MessageIDTypes.ID_SCENES];
            if (!scene) {
                return false;
            }
            else {
                packet.metadata["scene"] = scene;
                scene.handleMessage(packet);
                return true;
            }
        };
        SceneDispatcher.prototype.addScene = function (scene) {
            this._scenes[scene.handle - MessageIDTypes.ID_SCENES] = scene;
        };
        SceneDispatcher.prototype.removeScene = function (sceneHandle) {
            delete this._scenes[sceneHandle - MessageIDTypes.ID_SCENES];
        };
        return SceneDispatcher;
    })();
    // Contains method to register handlers for message types when passed to the IPacketProcessor.RegisterProcessor method.
    var PacketProcessorConfig = (function () {
        function PacketProcessorConfig(handlers, defaultprocessors) {
            this._handlers = handlers;
            this._defaultProcessors = defaultprocessors;
        }
        // Adds an handler for the specified message type.
        PacketProcessorConfig.prototype.addProcessor = function (msgId, handler) {
            if (this._handlers[msgId]) {
                throw new Error("An handler is already registered for id " + msgId);
            }
            this._handlers[msgId] = handler;
        };
        // Adds
        PacketProcessorConfig.prototype.addCatchAllProcessor = function (handler) {
            this._defaultProcessors.push(handler);
        };
        return PacketProcessorConfig;
    })();
    var TokenHandler = (function () {
        function TokenHandler() {
        }
        TokenHandler.prototype._tokenHandler = function () {
            this._tokenSerializer = new MsgPackSerializer();
        };
        TokenHandler.prototype.decodeToken = function (token) {
            var data = token.split('-')[0];
            var buffer = Helpers.base64ToByteArray(data);
            var result = this._tokenSerializer.deserialize(buffer);
            var sceneEndpoint = new SceneEndpoint();
            sceneEndpoint.token = token;
            sceneEndpoint.tokenData = result;
            return sceneEndpoint;
        };
        return TokenHandler;
    })();
    var SceneEndpoint = (function () {
        function SceneEndpoint() {
        }
        return SceneEndpoint;
    })();
    var ConnectionData = (function () {
        function ConnectionData() {
        }
        return ConnectionData;
    })();
    var ApiClient = (function () {
        function ApiClient(config, tokenHandler) {
            this.createTokenUri = "{0}/{1}/scenes/{2}/token";
            this._config = config;
            this._tokenHandler = tokenHandler;
        }
        ApiClient.prototype.getSceneEndpoint = function (accountId, applicationName, sceneId, userData) {
            var serializer = new MsgPackSerializer();
            var data = serializer.serialize(userData);
            var url = this._config.getApiEndpoint() + Helpers.stringFormat(this.createTokenUri, accountId, applicationName, sceneId);
            return jQueryWrapper.$.ajax({
                type: "POST",
                url: url,
                contentType: "application/msgpack",
                accepts: {
                    json: "application/json"
                },
                headers: {
                    "x-version": "1.0"
                },
                data: data
            }).done(function () {
                throw "Not implemented";
                //return this._tokenHandler.DecodeToken(response.ReadAsString());
            }).fail(function () {
                throw "Not implemented";
            });
        };
        return ApiClient;
    })();
    var MsgPackSerializer = (function () {
        function MsgPackSerializer() {
            this.name = "MsgPack";
        }
        MsgPackSerializer.prototype.serialize = function (data) {
            return new Uint8Array(msgpack.pack(data));
        };
        MsgPackSerializer.prototype.deserialize = function (bytes) {
            return msgpack.unpack(bytes);
        };
        return MsgPackSerializer;
    })();
    var Helpers = (function () {
        function Helpers() {
        }
        Helpers.base64ToByteArray = function (data) {
            return new Uint8Array(atob(data).split('').map(function (v) {
                return parseInt(v);
            }));
        };
        Helpers.stringFormat = function (str) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            for (var i in args) {
                str = str.replace('{' + i + '}', args[i]);
            }
            return str;
        };
        Helpers.mapKeys = function (map) {
            var keys = [];
            for (var key in map) {
                if (map.hasOwnProperty(key)) {
                    keys.push(key);
                }
            }
            return keys;
        };
        Helpers.mapValues = function (map) {
            var result = [];
            for (var key in map) {
                result.push(map[key]);
            }
            return result;
        };
        Helpers.promiseFromResult = function (result) {
            var deferred = jQuery.Deferred();
            deferred.resolve(result);
            return deferred.promise();
        };
        Helpers.promiseIf = function (condition, action) {
            if (condition) {
                return action();
            }
            else {
                return Helpers.promiseFromResult(null);
            }
        };
        return Helpers;
    })();
    //export class RequestModuleBuilder {
    //    private _addHandler: (msgId: number, handler: (context: RequestContext) => JQueryPromise<void>) => void;
    //    private requestModuleBuilder(addHandler: (msgId: number, handler: (context: RequestContext) => JQueryPromise<void>) => void) {
    //        if (!addHandler) {
    //            throw new Error("addHandler is null or undefined.");
    //        }
    //        this._addHandler = addHandler;
    //    }
    //    public service(msgId: number, handler: (context: RequestContext) => JQueryPromise<void>): void {
    //        this._addHandler(msgId, handler);
    //    }
    //}
    var RequestContext = (function () {
        function RequestContext(p) {
            this._didSendValues = false;
            this.isComplete = false;
            this._packet = p;
            this._requestId = p.data.subarray(0, 2);
            this.inputData = p.data.subarray(2);
        }
        RequestContext.prototype.send = function (data) {
            if (this.isComplete) {
                throw new Error("The request is already completed.");
            }
            this._didSendValues = true;
            var dataToSend = new Uint8Array(2 + data.length);
            dataToSend.set(this._requestId);
            dataToSend.set(data, 2);
            this._packet.connection.sendSystem(MessageIDTypes.ID_REQUEST_RESPONSE_MSG, dataToSend);
        };
        RequestContext.prototype.complete = function () {
            var dataToSend = new Uint8Array(3);
            dataToSend.set(this._requestId);
            dataToSend.set(2, this._didSendValues ? 1 : 0);
            this._packet.connection.sendSystem(MessageIDTypes.ID_REQUEST_RESPONSE_COMPLETE, dataToSend);
        };
        RequestContext.prototype.error = function (data) {
            var dataToSend = new Uint8Array(2 + data.length);
            dataToSend.set(this._requestId);
            dataToSend.set(data, 2);
            this._packet.connection.sendSystem(MessageIDTypes.ID_REQUEST_RESPONSE_ERROR, dataToSend);
        };
        return RequestContext;
    })();
    Stormancer.RequestContext = RequestContext;
    var RequestProcessor = (function () {
        function RequestProcessor(logger, modules) {
            this._pendingRequests = {};
            this._isRegistered = false;
            this._handlers = {};
            this._pendingRequests = {};
            this._logger = logger;
            for (var key in modules) {
                var mod = modules[key];
                mod.register(this.addSystemRequestHandler);
            }
        }
        RequestProcessor.prototype.registerProcessor = function (config) {
            this._isRegistered = true;
            for (var key in this._handlers) {
                var handler = this._handlers[key];
                config.addProcessor(key, function (p) {
                    var context = new RequestContext(p);
                    var continuation = function (fault) {
                        if (!context.isComplete) {
                            if (fault) {
                                context.error(p.connection.serializer.serialize(fault));
                            }
                            else {
                                context.complete();
                            }
                        }
                    };
                    handler(context).done(function () { return continuation(null); }).fail(function (error) { return continuation(error); });
                    return true;
                });
            }
        };
        RequestProcessor.prototype.addSystemRequestHandler = function (msgId, handler) {
            if (this._isRegistered) {
                throw new Error("Can only add handler before 'registerProcessor' is called.");
            }
            this._handlers[msgId] = handler;
        };
        RequestProcessor.prototype.reserveRequestSlot = function (observer) {
            var id = 0;
            while (id < 65535) {
                if (!this._pendingRequests[id]) {
                    var request = { lastRefresh: new Date, id: id, observer: observer, deferred: jQuery.Deferred() };
                    this._pendingRequests[id] = request;
                    return request;
                }
                id++;
            }
            throw new Error("Unable to create new request: Too many pending requests.");
        };
        RequestProcessor.prototype.sendSystemRequest = function (peer, msgId, data) {
            var _this = this;
            var deferred = $.Deferred();
            var request = this.reserveRequestSlot({
                onNext: function (packet) {
                    deferred.resolve(packet);
                },
                onError: function (e) {
                    deferred.reject(e);
                },
                onCompleted: function () {
                }
            });
            peer.sendSystem(msgId, data);
            deferred.promise().always(function () {
                var r = _this._pendingRequests[request.id];
                if (r == request) {
                    delete _this._pendingRequests[request.id];
                }
            });
            return deferred.promise();
        };
        return RequestProcessor;
    })();
    Stormancer.RequestProcessor = RequestProcessor;
    var Route = (function () {
        function Route(scene, name, index, metadata) {
            if (index === void 0) { index = 0; }
            if (metadata === void 0) { metadata = {}; }
            this.scene = scene;
            this.name = name;
            this.index = index;
            this.metadata = metadata;
            this.handlers = [];
        }
        return Route;
    })();
    Stormancer.Route = Route;
    var Scene = (function () {
        function Scene(connection, client, id, token, dto) {
            this._remoteRoutesMap = {};
            this._localRoutesMap = {};
            this._handlers = {};
            this.id = id;
            this.hostConnection = connection;
            this._token = token;
            this._client = client;
            this._metadata = dto.Metadata;
            for (var i = 0; i < dto.Routes.length; i++) {
                var route = dto.Routes[i];
                this._remoteRoutesMap[route.Name] = new Route(this, route.Name, route.Handle, route.Metadata);
            }
        }
        // Returns metadata informations for the remote scene host.
        Scene.prototype.getHostMetadata = function (key) {
            return this._metadata[key];
        };
        // Registers a route on the local peer.
        Scene.prototype.addRoute = function (route, handler, metadata) {
            if (metadata === void 0) { metadata = {}; }
            if (route[0] === "@") {
                throw new Error("A route cannot start with the @ character.");
            }
            if (this.connected) {
                throw new Error("You cannot register handles once the scene is connected.");
            }
            var routeObj = this._localRoutesMap[route];
            if (!routeObj) {
                routeObj = new Route(this, route, 0, metadata);
                this._localRoutesMap[route] = routeObj;
            }
            this.onMessage(route, handler);
        };
        Scene.prototype.onMessage = function (route, handler) {
            if (this.connected) {
                throw new Error("You cannot register handles once the scene is connected.");
            }
            var routeObj = this._localRoutesMap[route];
            if (!routeObj) {
                routeObj = new Route(this, route);
                this._localRoutesMap[route] = routeObj;
            }
            this.onMessageImpl(routeObj, handler);
        };
        Scene.prototype.onMessageImpl = function (route, handler) {
            var _this = this;
            var index = route.index;
            var action = function (p) {
                var packet = new Packet(_this.host(), p.data, p.metadata);
                handler(packet);
            };
            route.handlers.push(action);
        };
        // Sends a packet to the scene.
        Scene.prototype.sendPacket = function (route, data, priority, reliability, channel) {
            if (!route) {
                throw new Error("route is null or undefined!");
            }
            if (!data) {
                throw new Error("data is null or undefind!");
            }
            if (!this.connected) {
                throw new Error("The scene must be connected to perform this operation.");
            }
            var routeObj = this._remoteRoutesMap[route];
            if (!routeObj) {
                throw new Error("The route " + route + " doesn't exist on the scene.");
            }
            this.hostConnection.sendToScene(this.handle, routeObj.index, data, priority, reliability, channel);
        };
        // Connects the scene to the server.
        Scene.prototype.connect = function () {
            var _this = this;
            return this._client.connectToScene(this, this._token, Helpers.mapValues(this._localRoutesMap)).then(function () {
                _this.connected = true;
            });
        };
        // Disconnects the scene.
        Scene.prototype.disconnect = function () {
            return this._client.disconnectScene(this, this.handle);
        };
        Scene.prototype.handleMessage = function (packet) {
            var ev = this.packetReceived;
            ev && ev.map(function (value) {
                value(packet);
            });
            // extract the route id
            var temp = packet.data.subarray(0, 2);
            var routeId = new Uint16Array(temp.buffer)[0];
            packet.metadata["routeId"] = routeId;
            var observer = this._handlers[routeId];
            observer && observer.map(function (value) {
                value(packet);
            });
        };
        Scene.prototype.completeConnectionInitialization = function (cr) {
            this.handle = cr.SceneHandle;
            for (var key in this._localRoutesMap) {
                var route = this._localRoutesMap[key];
                route.index = cr.RouteMappings[key];
                this._handlers[route.index] = route.handlers;
            }
        };
        Scene.prototype.host = function () {
            return new ScenePeer(this.hostConnection, this.handle, this._remoteRoutesMap, this);
        };
        return Scene;
    })();
    Stormancer.Scene = Scene;
    var ScenePeer = (function () {
        function ScenePeer(connection, sceneHandle, routeMapping, scene) {
            this._connection = connection;
            this._sceneHandle = sceneHandle;
            this._routeMapping = routeMapping;
            this._scene = scene;
        }
        ScenePeer.prototype.id = function () {
            return this._connection.id;
        };
        ScenePeer.prototype.send = function (route, data, priority, reliability) {
            var r = this._routeMapping[route];
            if (!r) {
                throw new Error("The route " + route + " is not declared on the server.");
            }
            this._connection.sendToScene(this._sceneHandle, r.index, data, priority, reliability, 0);
        };
        return ScenePeer;
    })();
    Stormancer.ScenePeer = ScenePeer;
})(Stormancer || (Stormancer = {}));
(function ($, window) {
    Stormancer.jQueryWrapper.initWrapper($);
    $.stormancer = function (configuration) {
        return new Stormancer.Client(configuration);
    };
    //jQuery.support.cors = true
}(jQuery, window));
//# sourceMappingURL=stormancer.js.map