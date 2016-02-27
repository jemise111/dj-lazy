#!/usr/bin/env node
'use strict';

var _open = require('open');

var _open2 = _interopRequireDefault(_open);

var _xRay = require('x-ray');

var _xRay2 = _interopRequireDefault(_xRay);

var _spotifyWebApiNode = require('spotify-web-api-node');

var _spotifyWebApiNode2 = _interopRequireDefault(_spotifyWebApiNode);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _q = require('q');

var _q2 = _interopRequireDefault(_q);

var _commander = require('commander');

var _commander2 = _interopRequireDefault(_commander);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Check if credentials already exist in ENV
var authToken = process.env.DJ_LAZY_SPOTIFY_AUTHORIZATION;
// If not tell user you should set them there.

// Get command line args

_commander2.default.option('-m, --max <max>', 'The max number of albums to add').parse(process.argv);

var store = {
	userId: '',
	playlistId: '',
	scrapedAlbums: [],
	albumsSuccess: []
};

var config = {
	scopes: ['playlist-modify-public', 'playlist-modify-private'],
	redirectPath: '/spotify-auth',
	port: 8085
};

var clientId = process.env.DJ_LAZY_CLIENT_ID;
var clientSecret = process.env.DJ_LAZY_CLIENT_SECRET;
var redirectUri = 'http://localhost:' + config.port + config.redirectPath;

if (!clientId || !clientSecret) {
	var err = new Error('Missing cliendId or clientSecret\nEnsure you have DJ_LAZY_CLIENT_ID and DJ_LAZY_CLIENT_SECRET set as ENV variables');
	throw err;
}

// Create Spotify API wrapper
var spotifyApi = new _spotifyWebApiNode2.default({ clientId: clientId, clientSecret: clientSecret, redirectUri: redirectUri });

// Create the authorization URL
var authorizeURL = spotifyApi.createAuthorizeURL(config.scopes, 'mystate');

if (authToken) {
	startScraping(authToken);
} else {
	(function () {
		var app = (0, _express2.default)();
		var server = undefined;

		app.get(config.redirectPath, function (req, res) {
			// console.log('Here is your authorization token, you can avoid this step when running this script in the future by saving this token in an environment variable named LAZY_DJ_SPOTIFY_AUTHORIZATION');
			authToken = req.query.code;
			// console.log(authToken);
			res.send('<script>window.close();</script>');
			server.close();
			startScraping(authToken);
		});

		server = app.listen(config.port, function (_) {
			return console.log('Server listening on port ' + config.port + '!\n');
		});
		(0, _open2.default)(authorizeURL);
	})();
};

var authorize = function authorize(authToken) {
	return spotifyApi.authorizationCodeGrant(authToken);
};

var setAccessToken = function setAccessToken(data) {
	return spotifyApi.setAccessToken(data.body['access_token']);
};

var fetchUser = function fetchUser(_) {
	return spotifyApi.getMe();
};

var createPlaylist = function createPlaylist(_) {
	var date = new Date();
	var title = 'DJ Lazy ' + date.toLocaleDateString();
	return spotifyApi.createPlaylist(store.userId, title, { public: false });
};

var scrapeForAlbums = function scrapeForAlbums() {
	var deferred = _q2.default.defer();
	var x = (0, _xRay2.default)();
	x('http://www.allmusic.com/newreleases', x('.featured-rows .row .featured', [{
		artist: '.artist a:first-child',
		title: '.title a:first-child'
	}]))(function (err, data) {
		if (err) {
			console.error('Error trying to scrape');
			throw err;
		} else {
			deferred.resolve(data);
		}
	});
	return deferred.promise;
};

var getAlbumsTracks = function getAlbumsTracks(albumIds) {
	return _q2.default.all(albumIds.map(function (id) {
		return spotifyApi.getAlbumTracks(id);
	}));
};

function delay(delay) {
	var q = _q2.default.defer();
	setTimeout(q.resolve.bind(q), delay);
	return q.promise;
}

var addTracksToPlaylist = function addTracksToPlaylist(trackUris) {
	var defer = _q2.default.defer();
	var promise = defer.promise;
	for (var i = 0; i < trackUris.length; i += 50) {
		(function (i) {
			var endIndex = trackUris.length <= i + 50 ? trackUris.length : i + 50;
			promise = promise.then(function (_) {
				return spotifyApi.addTracksToPlaylist(store.userId, store.playlistId, trackUris.slice(i, endIndex));
			});
			promise = promise.then(function (_) {
				return delay(2000);
			});
		})(i);
	}
	defer.resolve();
	return promise;
};

function startScraping(authToken) {

	authorize(authToken).then(setAccessToken).then(fetchUser).then(function (userData) {
		store.userId = userData.body.id;
		return createPlaylist();
	}).then(function (playlistData) {
		store.playlistId = playlistData.body.id;
		return scrapeForAlbums();
	}).then(function (scrapedAlbums) {
		store.scrapedAlbums = scrapedAlbums;
		return _q2.default.all(scrapedAlbums.map(function (album) {
			return spotifyApi.searchAlbums('album:' + album.title + ' artist:' + album.artist);
		}));
	}).then(function (spotifyAlbumResultsData) {
		var maxAlbums = _commander2.default.max && parseInt(_commander2.default.max);
		var topMatchIds = spotifyAlbumResultsData.map(function (result, i) {
			if (result.body.albums && result.body.albums.items && result.body.albums.items.length) {
				if (!maxAlbums || store.albumsSuccess.length < maxAlbums) {
					store.albumsSuccess.push(store.scrapedAlbums[i]);
					return result.body.albums.items[0].id;
				}
			}
		}).filter(function (id) {
			return !!id;
		});
		return getAlbumsTracks(topMatchIds);
	}).then(function (albumsTracksData) {
		var albumsTracksUris = albumsTracksData.map(function (result) {
			return result.body.items.map(function (item) {
				return item.uri;
			});
		});
		var flatAlbumsTracksUris = [].concat.apply([], albumsTracksUris);
		return addTracksToPlaylist(flatAlbumsTracksUris);
	}).then(function (data) {
		console.log('Found Spotify Albums For');
		console.log('=========================');
		store.albumsSuccess.map(function (a) {
			return console.log(a.title + ' by ' + a.artist);
		});
		process.exit();
	}).catch(function (err) {
		console.log('Something went wrong!', err);
		throw err;
	});
}
//# sourceMappingURL=index.js.map