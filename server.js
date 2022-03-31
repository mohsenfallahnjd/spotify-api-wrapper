/**
 * @author MohsenFallahnejad
 */
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const SpotifyWebApi = require('spotify-web-api-node');
const axios = require('axios');
const path = require("path");
const fs = require("fs");
const db = require('./database.json')

/**
 * Credentials
 */
const spotify = {
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
};

/**
 * Register SpotifyWebApi
 */
const spotifyApi = new SpotifyWebApi({
    clientId: spotify.client_id,
    clientSecret : spotify.client_secret,
    redirectUri: spotify.redirect_uri,
});

/**
 * Authorize Spotify
 */
const authorizeSpotify = (req, res) => {
    res.redirect(`https://accounts.spotify.com/authorize?&client_id=${
        spotify.client_id
      }&redirect_uri=${encodeURI(
        spotify.redirect_uri
      )}&response_type=code&scope=${['user-read-private', 'user-read-currently-playing']}`
    );
};

/**
 * Get Access Token
 */
const getAccessToken = (req, res) => {
    res.setHeader("Content-Type", "application/json");

    const { code } = req.query;

    if (code) {
        spotifyApi.authorizationCodeGrant(code)
        .then(async (data) => {
            console.log('The token expires in ' + data.body['expires_in']);
            await spotifyApi.setAccessToken(data.body['access_token']);
            await spotifyApi.setRefreshToken(data.body['refresh_token']);
            await updateDatabase({
                expires_in: data.body['expires_in'],
                access_token: data.body['access_token'],
                refresh_token: data.body['refresh_token'],
                ...spotify,
            })

            await res.send({
                data: {
                    message: 'The access token has been set and Database update!',
                    status: 200
                }
            })

        }).catch((err) => {
            res.send(err)
            console.log('In __authorizationCodeGrant__ Something went wrong!', err);
        })
    }
};

/**
 * Get playing track information
 *
 * @description You can replace or add any method in spotify api
 * @source https://github.com/thelinmichael/spotify-web-api-node
 */
const getMyCurrentPlayingTrack = async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    if(db.access_token) {
        await spotifyApi.setAccessToken(db.access_token);
        await spotifyApi.setRefreshToken(db.refresh_token);
    }
    await spotifyApi.getMyCurrentPlayingTrack()
    .then((data) => {
        if(data.body.item) {
            return res.send({
                data: {
                    id: data.body.item.id,
                    preview_url: data.body.item.preview_url,
                    name: data.body.item.name,
                    href: data.body.item.external_urls.spotify,
                    artists: data.body.item.artists,
                    album: data.body.item.album,
                    is_playing: data.body.is_playing,
                },
                status: 200
            });
        }
        return res.send({
            data: {},
            status: 204
        });
        console.log('Now playing: ' + JSON.stringify(data.body.item.name));
    }).catch((err) => {
        res.send(err);
        console.log('In __getMyCurrentPlayingTrack__ Something went wrong!', err);
    });
}

/**
 * Refresh access_token
 */
const refreshToken = async (req, res) => {
    if(res) {
        await res.setHeader("Content-Type", "application/json");
    }

    if(db.access_token) {
        await spotifyApi.setAccessToken(db.access_token);
        await spotifyApi.setRefreshToken(db.refresh_token);
    }

    await spotifyApi.refreshAccessToken()
    .then((data) => {
        console.log('The access token has been refreshed!');
        spotifyApi.setAccessToken(data.body['access_token']);
        updateDatabase({
            expires_in: data.body['expires_in'],
            access_token: data.body['access_token'],
        })

        if(res) {
            res.send({
                data: {
                    message: 'The access token has been refreshed!',
                    status: 200
                }
            })
        }

    }).catch((err) => {
        res.send(err)
        console.log('Could not refresh access token', err);
    });
}

/**
 * Update database
 */
const updateDatabase = (data) => {
    fs.readFile(path.join(__dirname, "database.json"), "utf8", (err, json) => {
        const posts = JSON.parse(json);
        fs.writeFile(
            path.join(__dirname, "database.json"),
            JSON.stringify({ ...posts, ...data }),
            (e) => {
                if (e) throw e; console.log("Wrote File");
            }
        );
    });
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.set('port', process.env.PORT || 5000);
const server = app.listen(app.get('port'), async () => {
    await console.log(`Express running → PORT ${server.address().port}`);
    await refreshToken();
});

app.get('/', authorizeSpotify);
app.get('/callback', getAccessToken);
app.get('/get', getMyCurrentPlayingTrack);
app.get('/refresh', refreshToken);


/**
 * cron job time
 *
 * @source https://crontab.guru/
 * @description this cron, will run every hour, refresh token method
 */
cron.schedule('0 * * * *', refreshToken);
