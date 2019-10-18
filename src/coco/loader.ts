const fs = require('fs');

import {Canvas, createCanvas, Image, loadImage} from "canvas";
import {createCocoModel, ObjectDetection} from "./coco";

export class Loader {

    public static async loadCoco(useLiteModel: boolean, basePath?:string): Promise<Detector> {
        const model: ObjectDetection = await createCocoModel(useLiteModel, basePath);
        return {
            async detect(image: Image, logResults: boolean = false): Promise<Detection[]> {
                const start = Date.now();

                const canvas: Canvas = Loader.createCanvasFromImage(image);
                const results = await model.detect(canvas as unknown as HTMLCanvasElement);

                if (logResults) {
                    Loader.printProcessDuration('COCO', start);
                    Loader.printResults(results);
                }
                return results;
            }
        };
    }

    public static async createImage(pathOrUrl: string): Promise<Image> {
        try {
            return await loadImage(pathOrUrl);
        } catch (error) {
            throw new Error('Cannot load image!');
        }
    }

    public static createCanvasFromImage(image: Image): Canvas {
        const canvas: Canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, image.width, image.height);
        return canvas;
    }

    public static saveAnnotatedImage(image: Image, detections: Detection[]) {
        const canvas: Canvas = Loader.createCanvasFromImage(image);
        const ctx = canvas.getContext('2d');
        for (const detection of detections) {
            Loader.drawRect(ctx, detection.bbox);
        }
        Loader.saveImage(canvas);
    }

    private static drawRect(ctx: any, bbox: number[]) {
        ctx.strokeStyle = 'rgba(255,0,0,1)';
        ctx.beginPath();
        ctx.rect(bbox[0], bbox[1], bbox[2], bbox[3]);
        ctx.stroke();
    }

    private static  saveImage(canvas: Canvas) {
        const out = fs.createWriteStream(__dirname + '/snapshot-' + new Date().toISOString() + '.jpg');
        const stream = canvas.createJPEGStream();
        stream.pipe(out);
        out.on('finish', () =>  console.log('The snapshot has been saved!'));
    }

    private static printProcessDuration(name: string, start: number): void {
        console.log(name + ' processing took: ' + (Date.now() - start) + 'ms');
    }

    private static printResults(results: any[]): void {
        for (const result of results) {
            console.log('==> Detected: ' + result.class + ' [' + Math.round(result.score * 100) + '%]');
        }
        console.log('');
    }
}

export interface Detection {
    class: string;
    score: number;
    bbox: number[];
}

export interface Detector {
    detect(image: Image, logResults?: boolean): Promise<Detection[]>
}
