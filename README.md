# Unifi-Protect-Camera-Motion [![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins) 

[![Build Status](https://travis-ci.com/beele/homebridge-unifi-protect-camera-motion.svg?branch=master)](https://travis-ci.com/beele/homebridge-unifi-protect-camera-motion)
[![npm](https://badge.fury.io/js/homebridge-unifi-protect-camera-motion.svg)](https://www.npmjs.com/package/homebridge-unifi-protect-camera-motion)
[![donate](https://img.shields.io/badge/donate-paypal-green)](https://paypal.me/MrBeele?locale.x=nl_NL)
  
This Homebridge plugin allows you to add your Unifi Protect Cameras (and their Motion Sensors) to Homekit.

It is based on the very popular [FFmpeg Homebridge plugin](https://github.com/KhaosT/homebridge-camera-ffmpeg#readme) plugin, with Unifi-specific conveniences added to it. 
It is not necessary to have that plugin installed alongside this one, though they can be installed at the same time if you have non-Unifi Protect cameras as well.

# How it Works
This plugin will automatically discover all the Unifi cameras from your Protect installation, and provide the following sensors for each one it finds:

* Camera, for viewing live RTSP streams
* Motion sensor, for sending push-notifications when motion or one of the desired objects have been detected
* A Switch, for easily enabling and disabling motion detection (on by default and after a Homebridge restart)
* A Switch, to trigger a motion event manually, forcing a rich notification
* (if enabled) A switch, that acts as a doorbell trigger, to manually trigger a rich doorbell notification

# Motion Events
The plugin uses the Unifi Protect API to get motion events on a per camera basis.
When motion has been detected one of the two methods below will be used to generate a motion notification in Homekit:  
- The basic method: The "score" of the Unifi Protect motion event (which currently has a bug and is 0 as long as the motion is ongoing!)
- The advanced method: Object detection by use of a Tensorflow model. 
  This logic/model runs on-device, and no data will be sent to any online/external/cloud source or service. 
  It is based on the [coco ssd](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) project.
  
# Installation:  
Before installing this plugin, please make sure all the prerequisites have been met first.
Consult the readme and [the wiki](https://github.com/beele/homebridge-unifi-protect-camera-motion/wiki) before proceeding.

In short, the main dependencies are:
- Raspberry Pi / Ubuntu / Debian Linux:
  - install: `sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`
- Mac OS: 
  - install via Homebrew: `brew install pkg-config cairo pango libpng jpeg giflib librsvg`   
- Linux:
  - install g++: `sudo apt install g++`
- Other OSes:
  - [See the node-canvas documentation](https://github.com/Automattic/node-canvas#compiling)
  - [See the node-gyp documentation](https://github.com/nodejs/node-gyp) => install any dependencies for your OS!
  
Next, to install this plugin simply type:

```
sudo npm install homebridge-unifi-protect-camera-motion -g --unsafe-perm=true
```
  
Next, open the `config.json` that contains your Homebridge configuration, and add a block like the following one to the `platforms` array:
  
```javascript  
{  
    "platform": "UnifiProtectMotion", 
    "name": "Unifi protect cameras & motion sensors", 
    "unifi": { 
        "controller": "https://protect-ip:controller-ui-port", 
        "controller_rtsp": "rtsp://protect-ip:controller-rtsp-port", 
        "username": "username", 
        "password": "password", 
        "excluded_cameras": [
            "id-of-camera-to-exclude-1",
            "id-of-camera-to-exclude-2"
        ],
        "motion_interval": 5000, 
        "motion_repeat_interval": 30000, 
        "motion_score": 0, 
        "enhanced_motion": true, 
        "enhanced_motion_score": 50, 
        "enhanced_classes": ["person"], 
        "enable_motion_trigger": true,
        "enable_doorbell_for": [
            "id-of-camera-to-act-as-doorbell-1",
            "id-of-camera-to-act-as-doorbell-1"
        ],
        "save_snapshot": true,
        "upload_gphotos": false,
        "debug": false, 
        "debug_network_traffic": false,
    },
    "googlePhotos": {
        "upload_gphotos": false,
        "auth_clientId": "CLIENT-ID",
        "auth_clientSecret": "CLIENT-SECRET",
        "auth_redirectUrl": "http://localhost:8080/oauth2-callback"
    },
    "videoConfig": { 
        "vcodec": "h264",
        "audio": true,
        "maxStreams": 2,
        "maxWidth": 1920,
        "maxHeight": 1080,
        "maxFPS": 15,
        "mapvideo": "0:1",
        "mapaudio": "0:0",
        "maxBitrate": 3000,
        "packetSize": 188,
        "additionalCommandline": "-protocol_whitelist https,crypto,srtp,rtp,udp -loglevel verbose"
    }
}  
```  

You can verify the correctness of your config file by using [jsonlint](https://jsonlint.com/).   
The config must be valid or Homebridge will fail to restart correctly.
If you are using Homebridge Config X, it will do its best to alert you to any syntax errors it finds.

## Config fields:  

|Field|Type|Required|Default value|Description|
|-----|----|--------|-------------|-----------|
|platform|string|yes|/|UnifiProtectMotion|
|name|string|yes|/|Name of the plugin that shows up in the Homebridge logs|
|[unifi](https://github.com/beele/homebridge-unifi-protect-camera-motion#unifi-config-fields)|object|yes|/|Wrapper object containing the unifi configuration|
|[videoConfig](https://github.com/beele/homebridge-unifi-protect-camera-motion#video-config)|object|yes|/|Wrapper object containing the video configuration for FFmpeg|
|videoProcessor|string|no|ffmpeg|Contains the path to an custom FFmpeg binary|


### Unifi config fields:
|Field|Type|Required|Default value|Description|
|-----|----|--------|-------------|-----------|
|controller|string|yes|/|Contains the URL to the CloudKey or UDM with UnifiOS, or as legacy the URL to the Unifi Protect web UI, including port (no / or  /protect/ at the end!)|
|controller_rtsp|string|yes|/|Contains the base URL to be used for playing back the RTSP streams, as seen in the RTSP configuration (no / at the end)|
|username|string|yes|/|Contains the username that is used to login in the web UI|
|password|string|yes|/|Contains the password that is used to login in the web UI|
|excluded_cameras|no|string[]|[]|An array that contains the IDs of the cameras which should be excluded from the enumeration in Homekit, all available IDs are printed during startup|
|motion_interval|number|yes|/|Contains the interval in milliseconds used to check for motion, a good default is 5000 milliseconds|
|motion_repeat_interval|number|no|/|Contains the repeat interval in milliseconds during which new motion events will not be triggered if they belong to the same ongoing motion, a good default is 30000 to 60000 milliseconds. This will prevent a bunch of notifications for events which are longer than the motion_interval! Omit this field to disable this functionality|
|motion_score|number|yes|/|Contains the minimum score in % that a motion event has to have to be processed, a good default is 50%, set this to 0 when using enhanced motion!|
|enhanced_motion|boolean|yes|/|Enables or disables the enhanced motion & object detection detection with Tensorflow|
|enhanced_motion_score|number|sometimes|/|This field is required if the `enhanced_motion` field is set to true and contains the minimum score/certainty in % the enhanced detection should reach before allowing an motion event to be triggered |
|enhanced_classes|string[]|sometimes|[]|This field is required if the `enhanced_motion` field is set to true and contains an array of classes (in lowercase) of objects to dispatch motion events for. The array should not be empty when using the enhanced detection! Look in look in src/coco/classes.ts for all available classes|
|enable_motion_trigger|boolean|no|false|Contains a boolean that when set to true will enable an extra button for each camera to manually trigger a motion notification|
|enable_doorbell_for|string[]|no|[]|Contains the id of the cameras for which the doorbell functionality should be enabled, all available IDs are printed during startup|
|save_snapshot|boolean|no|false|Contains a boolean indicating whether or not to save each detection to a jpg file in the `.homebridge` directory. When using enhanced mode the image is annotated with the class/score that was detected.|
|upload_gphotos|boolean|no|false|Contains a boolean indicating whether or not to upload each detection to a google photos album. When using enhanced mode the image is annotated with the class/score that was detected.|
|debug|boolean|no|false|Contains a boolean indicating whether or not to enable debug logging for the plugin and FFmpeg|
|debug_network_traffic|boolean|no|false|Contains a boolean indication whether or not to enable logging of all network requests|

### Google Photos config:

|Field|Type|Required|Default value|Description|
|-----|----|--------|-------------|-----------|
|upload_gphotos|boolean|no|false|Set this to true to enable uploading of snapshots to Google Photos|
|auth_clientId|string|sometimes|/|This field is required when the `upload_gphotos` is set to true. Fill in the Client ID you generated for OAuth2 authentication|
|auth_clientSecret|string|sometimes|/|This field is required when the `upload_gphotos` is set to true. Fill in the Client Secret you generated for OAuth2 authentication|
|auth_redirectUrl|string|sometimes|/|Fill in 'http://localhost:8080/oauth2-callback' as a default, if you change this value to something else, also change it when creating the OAuth2 credentials!|

To enable the upload to Google Photos functionality:
- Go to the [Google Cloud Platform developer console](https://console.cloud.google.com/apis/credentials)
- [Create a new project](https://console.cloud.google.com/projectcreate?previousPage=%2Fapis%2Fcredentials)
- You will be redirected to the first page, here select the newly created project from the dropdown on the top left
- Select the `OAuth consent screen` from the left sidebar menu
- Select `External` and continue
- On the next screen only fill in a name for the application and click `save`
- Select the `Credentials` from the left sidebar menu
- Click `Create credentials` from the top and select `OAuth Client ID` from the dropdown options
- Select `web application`, give it a name and fill in the callback URLs with: `http://localhost:8080` for the first and `http://localhost:8080/oauth2-callback` for the second entry (make sure the press return/enter to submit the values, as multiple ones are possible), then click `create` at the bottom of the page
- Copy your Client ID and Client secret and store them safely
- Open your config.json, and add a `googlePhotos` object as described in the table above
- Start your Homebridge instance, it will print out an url, open it in a browser and follow the login instructions
- The page where you will be redirected will display an error unless you are running Homebridge on the same machine as you are running the browser
- Copy the full url, replace the localhost (if Homebridge is not running on your current machine) in the address bar with the ip-address of your Homebridge device, visit the page, you should get the following message: `OAuth2 callback handled!`
- You are now authenticated, and the refresh token has been saved to the previously created config file.
- The plugin will then create an album named `Homebridge-Unifi-Protect-Motion-Captures`, it will also store the ID of this album so the next time it is not created again (you can rename this album to anything you want)
- Any detected motions (both normal and enhanced) will now be uploaded to the newly created album


### Video Config:

This config object is the same as used in the Homebridge-Camera-FFmpeg plugin.
Consult the documentation for more details: [FFmpeg configuration](https://github.com/KhaosT/homebridge-camera-ffmpeg#readme). 
- ***Make sure the fields `source` and `stillImageSource` are omitted from the config object as these will be generated by the plugin itself!***
- Make sure each of your Unifi cameras has anonymous snapshots enabled, this is needed to perform the object detection.
  - To enable anonymous snapshots: Login on the camera itself (visit the camera's ip address)    
      ![Anonymous snapshot](resources/images/readme/anonymous_snapshot.jpg?raw=true "CloudKey Gen2 Plus")  
  - To enable an RTSP stream: Login on the Protect web UI and go the settings of the camera and open the 'manage' tab   
      Make sure that all your cameras have the same port for the RTSP stream!  
      For optimal results it is best to assign a static ip to your cameras  
      ![Enable RTSP stream](resources/images/readme/enable_rtsp.jpg?raw=true "CloudKey Gen2 Plus")  
- Make sure each of your Unifi cameras has at least one RTSP stream enabled, I suggest enabling the 1080P one in the Protect web interface, this is needed to view the livestream from the camera.
  
## How to add the cameras to your Homekit setup:  

As per 0.4.1 the enumerated cameras and accompanying switches/triggers will show up automatically, You don't need to add them in manually anymore!
If you add your Homebridge instance to the Home app the cameras will automatically be there.

### Upgrade notice!

If you are upgrading from a pre 0.4.1 the cameras you previously had in the Home app will no longer work and will have to be removed!
Tap on a camera preview to open the camera feed, click the settings icon and scroll all the way to the bottom, there select `Remove camera from home`.
  
## How to enable rich notifications (with image preview):  
  
- Go to the settings of the camera view in the Home app  
- Each camera has an accompanying motion sensor   
- Enable notifications for the camera  
- Whenever motion has been detected you will get a notification from the home app with a snapshot from the camera  
  
## Tested with:  
  
- Raspberry Pi 3B with Node 11.15.0 as Homebridge host  
- Raspberry Pi 4B 4GB with Node 12.14.0 as Homebridge host  
- Macbook Pro with Node 12.18.0 as Homebridge host  
- Windows 10 with Node 12.13.0 as Homebridge host
- Ubiquiti UniFi CloudKey Gen2 Plus - Cloud Key with Unifi Protect functionality  
  <br/><br/>![CloudKey Gen2 Plus](resources/images/readme/cloudkey-gen2plus.jpg?raw=true "CloudKey Gen2 Plus")  
- 2x Ubiquiti UniFi Video UVC-G3-AF - PoE Camera  
  <br/><br/>![Camera UVC-G3-AF](resources/images/readme/camera.jpeg?raw=true "Camera UVC-G3-AF")  
- 2x Ubiquiti Unifi Video UVC-G3-Flex - PoE Camera  
  <br/><br/>![Camera UVC-G3-Flex](resources/images/readme/camera2.jpeg?raw=true "Camera UVC-G3-Flex")  
  
## Limitations, known issues & TODOs:  
  
### Limitations:  
 
- Running this plugin on CPUs that do not support AVX (Celerons in NAS systems, ...) is not supported because there are no prebuilt Tensorflow binaries. 
  Compiling Tensorflow from scratch is out of scope for this project!
  - Run it on a RBPI or machine with MacOS / Windows / Linux (Debian based)
- ~~Previews in notifications are requested by the Home app, and can thus be "after the fact" and show an image with nothing of interest on it.~~   
  - ~~The actual motion detection is done with the snapshot that is requested internally.~~  
- Unifi Protect has a snapshot saved for every event, and there is an API to get these (with Width & Height), but the actual saved image is pretty low res and is upscaled to 1080p. 
  Using the Anonymous snapshot actually gets a full resolution snapshot which is better for object detection.  
- There is no way to know what motion zone (from Unifi) a motion has occurred in. 
  This information is not present is the response from their API.  
- The enhanced object detection using CoCo is not perfect and might not catch all the thing you want it to.
  It should do fine in about 95% of cases though.
  
### TODOs:  

- Add more unit and integration tests 
- Upgrade tfjs-node, now held back because newer versions (Upgrade to 2.x.x in future release)
- Add support for MQTT (coming in future release)
- ~~Implement required changes to make this work with Unifi OS~~
- ~~Figure out how to get higher res streams on iPhone (only iPad seems to request 720p streams)~~ (Done)
- ~~Extend documentation & wiki~~ (Done)
  
# Plugin development:  
- Checkout the git repo  
- Run `npm install` in the project root folder
- Adjust the dummy config under `resources/test-config/config.json`  
- use `npm run watch` to automatically watch for changes and restart Homebridge if needed, you can also add a remote debugger on port 4444 to debug the code.
- use `npm run homebridge` to start a Homebridge instance that points to the local config that does not auto-reload when changes are saved.
  
# Disclaimer  
  
This plugin is provided free of charge and without any warranty of its functionality.  
The creator cannot be held responsible for any damages, missed motion notifications that cause damage or harm.
