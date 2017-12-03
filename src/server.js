import express from 'express';
import bodyParser from 'body-parser';
import request from 'request-promise';
import cheerio from 'cheerio';
import fs from 'fs';
import _ from 'lodash';
import { resolve } from 'path';
import cors from 'cors';

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

app.get('/api/movie', (req, res) => {
	const list = _.sampleSize(movies, 30);
	res.json({ movies: list });
});

app.get('/api/movie/:slug', (req, res) => {
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

app.get('/images/*', (req, res) => {
	const uri = `https://hd-arab.com/images/${req.params[0]}`;
	request({ uri, headers: { host: 'hd-arab.com' } }).pipe(res);
});

app.listen(3001, () => console.log('Server running on port 3001'));
