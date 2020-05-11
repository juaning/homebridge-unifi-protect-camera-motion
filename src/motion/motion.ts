import {UnifiCamera, UnifiConfig, UnifiMotionEvent} from "../unifi/unifi";
import {Detection, Detector, Loader} from "../coco/loader";
import {UnifiFlows} from "../unifi/unifi-flows";
import {Image} from "canvas";
import {ImageUtils} from "../utils/image-utils";
import {GooglePhotos, GooglePhotosConfig} from "../utils/google-photos";
import type { API, PlatformConfig} from 'homebridge';

const path = require('path');

export class MotionDetector {

    private readonly homebridge: API;

    private readonly unifiConfig: UnifiConfig;
    private readonly googlePhotosConfig: GooglePhotosConfig;
    private readonly flows: UnifiFlows;
    private readonly cameras: UnifiCamera[];
    private readonly log: Function;

    private detector: Detector;
    private gPhotos: GooglePhotos;
    private configuredAccessories: any[];

    constructor(homebridge: API, config: PlatformConfig, unifiFlows: UnifiFlows, cameras: UnifiCamera[], logger: Function) {
        this.homebridge = homebridge;

        this.unifiConfig = config.unifi;
        this.googlePhotosConfig = config.googlePhotos;
        this.flows = unifiFlows;
        this.cameras = cameras;

        this.log = logger;

        this.detector = null;
        this.gPhotos = this.googlePhotosConfig && this.googlePhotosConfig.upload_gphotos ? new GooglePhotos(config.googlePhotos, logger) : null;
    }

    public async setupMotionChecking(configuredAccessories: any[]): Promise<any> {
        this.configuredAccessories = configuredAccessories;

        let intervalFunction: Function;
        if (this.unifiConfig.enhanced_motion) {
            try {
                this.detector = await Loader.loadCoco(false, path.dirname(require.resolve('homebridge-unifi-protect-camera-motion/package.json')));
            } catch (error) {
                this.detector = await Loader.loadCoco(false, './');
            }
            intervalFunction = this.checkMotionEnhanced.bind(this);
        } else {
            intervalFunction = this.checkMotion.bind(this);
        }

        setInterval(() => {
            try {
                intervalFunction();
            } catch (error) {
                this.log('Error during motion interval loop: ' + error);
            }
        }, this.unifiConfig.motion_interval);
        return;
    }

    private async checkMotion(): Promise<any> {
        let motionEvents: UnifiMotionEvent[];
        try {
            motionEvents = await this.flows.getLatestMotionEventPerCamera(this.cameras);
        } catch (error) {
            this.log('Cannot get latest motion info: ' + error);
            motionEvents = [];
        }

        outer: for (const configuredAccessory of this.configuredAccessories) {
            configuredAccessory.getService(this.homebridge.hap.Service.MotionSensor).setCharacteristic(this.homebridge.hap.Characteristic.MotionDetected, 0);
            if (!configuredAccessory.context.motionEnabled) {
                continue;
            }

            for (const motionEvent of motionEvents) {
                if (motionEvent.camera.id === configuredAccessory.context.id) {
                    if (this.isSkippableLongRunningMotion(configuredAccessory, motionEvent)) {
                        return;
                    }

                    this.log('!!!! Motion detected (' + motionEvent.score + '%) by camera ' + motionEvent.camera.name + ' !!!!');
                    configuredAccessory.getService(this.homebridge.hap.Service.MotionSensor).setCharacteristic(this.homebridge.hap.Characteristic.MotionDetected, 1);

                    let snapshot: Image;
                    try {
                        snapshot = await ImageUtils.createImage('http://' + motionEvent.camera.ip + '/snap.jpeg');
                        this.persistSnapshot(snapshot, 'Motion detected (' + motionEvent.score + '%) by camera ' + motionEvent.camera.name, []);
                    } catch (error) {
                        this.log('Cannot save snapshot: ' + error);
                    }

                    continue outer;
                }
            }
        }
    }

    private async checkMotionEnhanced(): Promise<any> {
        let motionEvents: UnifiMotionEvent[];
        try {
            motionEvents = await this.flows.getLatestMotionEventPerCamera(this.cameras);
        } catch (error) {
            this.log('Cannot get latest motion info: ' + error);
            motionEvents = [];
        }

        outer: for (const configuredAccessory of this.configuredAccessories) {
            configuredAccessory.getService(this.homebridge.hap.Service.MotionSensor).setCharacteristic(this.homebridge.hap.Characteristic.MotionDetected, 0);
            if (!configuredAccessory.context.motionEnabled) {
                continue;
            }

            for (const motionEvent of motionEvents) {
                if (motionEvent.camera.id === configuredAccessory.context.id) {
                    let snapshot: Image;
                    try {
                        snapshot = await ImageUtils.createImage('http://' + motionEvent.camera.ip + '/snap.jpeg');
                    } catch (error) {
                        continue;
                    }
                    const detections: Detection[] = await this.detector.detect(snapshot, this.unifiConfig.debug);

                    for (const classToDetect of this.unifiConfig.enhanced_classes) {
                        const detection: Detection = this.getDetectionForClassName(classToDetect, detections);

                        if (detection) {
                            if (this.isSkippableLongRunningMotion(configuredAccessory, motionEvent)) {
                                return;
                            }

                            const score: number = Math.round(detection.score * 100);
                            if (score >= this.unifiConfig.enhanced_motion_score) {
                                this.log('!!!! ' + classToDetect + ' detected (' + score + '%) by camera ' + motionEvent.camera.name + ' !!!!');
                                configuredAccessory.getService(this.homebridge.hap.Service.MotionSensor).setCharacteristic(this.homebridge.hap.Characteristic.MotionDetected, 1);
                                await this.persistSnapshot(snapshot, classToDetect + ' detected (' + score + '%) by camera ' + motionEvent.camera.name, [detection]);
                                continue outer;
                            } else {
                                this.log('!!!! Detected class: ' + detection.class + ' rejected due to score: ' + score + '% (must be ' + this.unifiConfig.enhanced_motion_score + '% or higher) !!!!');
                            }
                        } else {
                            console.log('None of the required classes found by enhanced motion detection, discarding!');
                        }
                    }
                }
            }
        }
    }

    private async persistSnapshot(snapshot: Image, description: string, detections: Detection[]): Promise<void> {
        let localImagePath: string = null;
        if (this.unifiConfig.save_snapshot) {
            localImagePath = await ImageUtils.saveAnnotatedImage(snapshot, detections);
        }
        if (this.googlePhotosConfig.upload_gphotos) {
            let imagePath: string = localImagePath ? localImagePath : await ImageUtils.saveAnnotatedImage(snapshot, detections);
            const fileName: string = imagePath.split('/').pop();
            //No await because the upload should not block!
            this.gPhotos
                .uploadImage(imagePath, fileName, description)
                .then((url: string) => {
                    this.log('Photo uploaded: ' + url);

                    if (!localImagePath) {
                        ImageUtils.remove(imagePath);
                    }
                });
        }
    }

    private isSkippableLongRunningMotion(accessory: any, motionEvent: UnifiMotionEvent): boolean {
        //Prevent repeat motion notifications for motion events that are longer then the motion_interval unifiConfig setting!
        if (this.unifiConfig.motion_repeat_interval) {
            if (accessory.context.lastMotionId === motionEvent.id) {
                accessory.context.lastMotionIdRepeatCount++;

                if (accessory.context.lastMotionIdRepeatCount === (this.unifiConfig.motion_repeat_interval / this.unifiConfig.motion_interval)) {
                    accessory.context.lastMotionIdRepeatCount = 0;
                } else {
                    this.log('Motion detected inside of skippable timeframe, ignoring!');
                    return true;
                }
            } else {
                accessory.context.lastMotionId = motionEvent.id;
                accessory.context.lastMotionIdRepeatCount = 0;
            }
        }
        return false;
    }

    private getDetectionForClassName(className: string, detections: Detection[]) {
        for (const detection of detections) {
            if (detection.class.toLowerCase() === className.toLowerCase()) {
                return detection;
            }
        }
        return null;
    }
}
