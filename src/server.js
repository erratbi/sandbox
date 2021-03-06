import express from 'express';
import bodyParser from 'body-parser';
import request from 'request-promise';
import cheerio from 'cheerio';
import fs from 'fs';
import _ from 'lodash';
import { resolve } from 'path';
import cors from 'cors';
import strs from 'string-to-stream';

const corsOptions = {
	origin: 'http://localhost:3000',
	optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
};

const app = express();
app.set('view engine', 'pug');
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(cors(corsOptions));
const data = fs.readFileSync(resolve(__dirname, '../data/data2.json'));
const movies = JSON.parse(data);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

app.use(function(req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});

app.get('/video', async (req, res) => {
	const rest = await request({ uri: 'blob:https://gostream.is/6b2ad49f-9a49-497c-a002-23848ab900b0' });
	console.log(rest);
	res.render('video');
});

app.get('/playlist', async (req, res) => {
	const eid = '1067734';
	const mid = '22407';
	let uri = `https://gostream.is/ajax/movie_token?eid=${eid}&mid=${mid}`;
	const coords = await request({
		uri,
		transform: data => {
			let _x, _y;
			eval(data);
			return { x: _x, y: _y };
		}
	});

	uri = `https://gostream.is/ajax/movie_sources/${eid}?x=${coords.x}&y=${coords.y}`;
	const source = await request({ uri, json: true });
	uri = source.playlist[0].sources[0].file;

	res.setHeader('Content-Type', 'application/octet-stream');
	res.setHeader('Content-Disposition', 'attachment; filename=playlist.m3u');

	const playlist = await request({
		uri,
		headers: { referer: 'https://yesmovies.to' },
		transform: playlist => {
			let base = uri.split('playlist.m3u8')[0];
			let proxy = 'http://localhost:3001/lemon?file=';
			const soup = playlist.replace(/EXTINF:5.000,\n/gi, `EXTINF:5.000,\n${proxy}${base}`);
			return soup;
		}
	});
	res.write(playlist);
	res.end();
});

app.get('/api/movie', async (req, res) => {
	await sleep(1000);
	res.json({ movies: _.sampleSize(movies, 30) });
});

app.get('/api/recommended/:slug', async (req, res) => {
	await sleep(1000);
	res.json({ movies: _.sampleSize(movies, 12) });
});

app.get('/api/movie/:slug', async (req, res) => {
	await sleep(1000);
	const { slug } = req.params;
	const movie = _.find(movies, { slug });
	if (!movie || !movie.links) return res.status(404).json({ error: 'Not found' });
	res.json({ movie });
});

app.get('/api/source/:type/:hash', async (req, res) => {
	const { hash, type } = req.params;
	if (type === 'l') {
		const uri = `https://hd-arab.com/player/download/${hash}`;
		let $;
		try {
			$ = await request({ uri, transform: body => cheerio.load(body) });
		} catch (err) {
			return res.status(404).end('Not found');
		}
		const links = $('.download_links a')
			.map((i, el) => ({
				file: $(el)
					.attr('href')
					.replace('/download?', '/videoplayback?'),
				label: $(el)
					.find('span')
					.text()
					.trim()
					.toUpperCase(),
				type: 'video/mp4',
				default:
					$(el)
						.find('span')
						.text()
						.trim() === '1080P'
			}))
			.get();
		return res.json({ sources: links });
	}

	if (type === 'r') {
		const urls = [
			`https://www.rapidvideo.com/e/${hash}?q=1080p`,
			`https://www.rapidvideo.com/e/${hash}?q=720p`,
			`https://www.rapidvideo.com/e/${hash}?q=480p`,
			`https://www.rapidvideo.com/e/${hash}?q=360p`
		];

		try {
			const links = await Promise.all(
				urls.map(uri =>
					request({
						uri,
						transform: body => {
							const $ = cheerio.load(body);
							return {
								file: $('#videojs source').attr('src'),
								label: uri.split('?q=')[1],
								type: 'mp4',
								default: uri.split('?q=')[1] === '1080p'
							};
						}
					})
				)
			);
			return res.json({ sources: links });
		} catch (error) {
			return res.status(404).end('Not found');
		}
	}
	return res.status(404).end('Not found');
});

app.get('/lemon', async (req, res) => {
	const { file } = req.query;
	const headers = _.extend(req.headers, { host: 'streaming.lemonstream.me', referer: 'https://gostream.is' });
	request({ uri: file, headers }).pipe(res);
});

app.get('/images/*', (req, res) => {
	const uri = `https://hd-arab.com/images/${req.params[0]}`;
	request({ uri, headers: { host: 'hd-arab.com' } }).pipe(res);
});

app.listen(3001, () => console.log('Server running on port 3001'));
