import {Utils} from "../utils/utils";

const request = require('request-promise-native');

export class Unifi {

    private readonly config: UnifiConfig;

    private readonly initialBackoffDelay: number;
    private readonly maxRetries: number;

    private readonly log: any;

    constructor(config: UnifiConfig, initialBackoffDelay: number, maxRetries: number, logger: Function) {
        this.config = config;
        this.initialBackoffDelay = initialBackoffDelay;
        this.maxRetries = maxRetries;

        this.log = logger;
    }

    public static async determineEndpointStyle(baseControllerUrl: string): Promise<UnifiEndPointStyle> {
        const opts = {
            uri: baseControllerUrl,
            resolveWithFullResponse: true,
            timeout: 1000
        };

        const response: any = await request.get(opts);
        if (response.headers['x-csrf-token']) {
            return {
                authURL: baseControllerUrl + '/api/auth/login',
                apiURL: baseControllerUrl + '/proxy/protect/api/bootstrap',
                isUnifiOS: true,
                csrfToken: response.headers['x-csrf-token']
            }
        } else {
            return {
                authURL: baseControllerUrl,
                apiURL: baseControllerUrl,
                isUnifiOS: false
            }
        }
    }

    public async authenticate(username: string, password: string, endpointStyle: UnifiEndPointStyle): Promise<UnifiSession> {
        if (!username || !password) {
            throw new Error('Username and password should be filled in!');
        }

        const opts = {
            uri: endpointStyle.authURL + '/api/auth',
            headers: endpointStyle.isUnifiOS ?
                {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': endpointStyle.csrfToken
                } : {
                    'Content-Type': 'application/json'
                },
            body: {
                "username": username,
                "password": password
            },
            json: true,
            strictSSL: false,
            resolveWithFullResponse: true,
            timeout: 1000
        };

        const response: any = await Utils.backoff(this.maxRetries, request.post(opts), this.initialBackoffDelay);
        Utils.checkResponseForErrors(response, 'headers', ['authorization']);

        this.log('Authenticated, returning session');
        const authorization = response.headers['authorization'];
        return {
            authorization,
            timestamp: Date.now()
        };
    }

    //TODO: Is checking for expired session still needed with unifiOS?
    public isSessionStillValid(session: UnifiSession): boolean {
        //Validity duration for now set at 12 hours!
        if (session) {
            if ((session.timestamp + (12 * 3600 * 1000)) >= Date.now()) {
                return true;
            } else {
                this.log('WARNING: Session expired, a new session must be created!');
            }
        } else {
            this.log('WARNING: No previous session found, a new session must be created!');
        }
        return false;
    }

    public async enumerateMotionCameras(session: UnifiSession, endPointStyle: UnifiEndPointStyle): Promise<UnifiCamera[]> {
        const opts = {
            uri: endPointStyle.apiURL + '/api/bootstrap',
            headers: endPointStyle.isUnifiOS ?
                {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': endPointStyle.csrfToken
                } : {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.authorization
                },
            json: true,
            strictSSL: false,
            resolveWithFullResponse: true,
            timeout: 1000
        };

        const response: any = await Utils.backoff(this.maxRetries, request.get(opts), this.initialBackoffDelay);
        Utils.checkResponseForErrors(response, 'body', ['cameras']);

        this.log('Cameras retrieved, enumerating motion sensors');
        const cams = response.body.cameras;

        return cams.map((cam: any) => {
            if (this.config.debug) {
                this.log(cam);
            }

            const streams: UnifiCameraStream[] = [];
            for (const channel of cam.channels) {
                if (channel.rtspAlias) {
                    streams.push({
                        name: channel.name,
                        alias: channel.rtspAlias,
                        width: channel.width,
                        height: channel.height,
                        fps: channel.fps
                    });
                }
            }

            //Sort streams on highest res!
            streams.sort((a: UnifiCameraStream, b: UnifiCameraStream): number => {
                return (a.height * a.width) - (b.height * b.width);
            });

            return {
                id: cam.id,
                name: cam.name,
                ip: cam.host,
                mac: cam.mac,
                type: cam.type,
                firmware: cam.firmwareVersion,
                streams: streams
            }
        });
    }

    public async getMotionEvents(session: UnifiSession, endPointStyle: UnifiEndPointStyle): Promise<UnifiMotionEvent[]> {
        const endEpoch = Date.now();
        const startEpoch = endEpoch - (this.config.motion_interval * 2);

        const opts = {
            uri: endPointStyle.apiURL + '/api/events?end=' + endEpoch + '&start=' + startEpoch + '&type=motion',
            headers: endPointStyle.isUnifiOS ?
                {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': endPointStyle.csrfToken
                } : {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.authorization
                },
            json: true,
            strictSSL: false,
            resolveWithFullResponse: true,
            timeout: 1000
        };

        const response: any = await Utils.backoff(this.maxRetries, request.get(opts), this.initialBackoffDelay);
        Utils.checkResponseForErrors(response, 'body');

        const events: any[] = response.body;
        return events.map((event: any) => {
            if (this.config.debug) {
                this.log(event);
            }

            return {
                id: event.id,
                cameraId: event.camera,
                camera: null,
                score: event.score,
                timestamp: event.start //event.end is null when the motion is still ongoing!
            }
        });
    }
}

export interface UnifiSession {
    authorization: any;
    timestamp: number;
}

export interface UnifiCamera {
    id: string;
    name: string;
    ip: string;
    mac: string;
    type: string;
    firmware: string;
    streams: UnifiCameraStream[];
}

export interface UnifiCameraStream {
    name: string;
    alias: string;
    width: number;
    height: number;
    fps: number;
}

export interface UnifiMotionEvent {
    id: string;
    cameraId: string;
    camera?: UnifiCamera;
    score: number;
    timestamp: number;
}

export interface UnifiConfig {
    controller: string;
    controller_rtsp: string;
    username: string;
    password: string;
    motion_interval: number;
    motion_repeat_interval: number;
    motion_score: number;
    enhanced_motion: boolean;
    enhanced_motion_score: number;
    enhanced_classes: string[];
    debug: boolean;
    save_snapshot: boolean;
}

export interface UnifiEndPointStyle {
    authURL: string;
    apiURL: string;
    isUnifiOS: boolean;
    csrfToken?: string;
}