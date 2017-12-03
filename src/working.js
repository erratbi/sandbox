import request from 'request-promise';
import _ from 'lodash';
import fs from 'fs';
import { resolve } from 'path';
import cheerio from 'cheerio';

export const getMovieSlug = url => _.get(/\/([^\/]+?)\/?$/.exec(url), '[1]', '');

export const getTempUrl = async uri => {
	const $ = await request({ uri, transform: body => cheerio.load(body) });
	let links = {};
	if ($('#player_1 iframe').length)
		links['local'] = $('#player_1 iframe')
			.data('src')
			.trim();

	if ($('#player_2 iframe').length)
		links['remote'] = $('#player_2 iframe')
			.data('src')
			.trim();

	return links;
};

export const getLinks = async (url, type = 'Movie') => {
	console.log(url);
	if (type === 'Movie') {
		return getTempUrl(url);
	} else {
		return null;
	}
};

export const getMoviesUrls = async (page = 1) => {
	const uri = `https://hd-arab.com/movies/?page=${page}`;
	try {
		const $ = await request({ uri, transform: body => cheerio.load(body) });
		return $('ul.movie-list .movie-list-item a.movie-poster')
			.map((i, el) => $(el).attr('href'))
			.get();
	} catch (error) {
		return [];
	}
};

export const getShowUrls = async (page = 1) => {
	const uri = `https://hd-arab.com/tvshows/?page=${page}`;
	try {
		const $ = await request({ uri, transform: body => cheerio.load(body) });
		return $('ul.movie-list .movie-list-item a.movie-poster')
			.map((i, el) => $(el).attr('href'))
			.get();
	} catch (error) {
		return null;
	}
};

export const getEpisodes = async uri => {
	const $ = await request({ uri, transform: body => cheerio.load(body) });
	return $('.season_episode')
		.map((i, el) => ({
			number: i + 1,
			episodes: $(el)
				.find('.episode_list li a')
				.map((j, elm) => $(elm).attr('href'))
				.get()
		}))
		.get();
};

export const getMovieData = async uri => {
	const slug = getMovieSlug(uri);
	let $ = null;
	let links = null;

	const type = uri.includes('/tvshows/') ? 'Show' : 'Movie';

	try {
		$ = await request({ uri, transform: body => cheerio.load(body) });
		if (!$) return null;

		links = type === 'Show' ? await getShowLinks(uri) : await getLinks(uri);
		if (!links) return null;
	} catch (error) {
		return null;
	}

	return {
		url: uri,
		slug,
		type,
		title: $('.single-title-header [itemprop="name"]').attr('content'),
		cover: $('figure.single-cover img').attr('src'),
		poster: $('.single-poster-img img').attr('src'),
		description: $('.single-description p')
			.text()
			.trim(),
		imdb: $('meta[itemprop="ratingValue"]').attr('content'),
		view: $('span.item-views')
			.text()
			.trim(),
		release: $('span[itemprop="datePublished"]').attr('content'),
		genres: $('.single-genre p a')
			.map((i, el) =>
				$(el)
					.text()
					.trim()
			)
			.get(),
		language: $('span[itemprop="inLanguage"]')
			.text()
			.trim(),
		country: $('.item-details .item-container')
			.eq(1)
			.find('span.item-value')
			.text()
			.trim(),
		directors: $('.item-details .item-container.item-full')
			.eq(0)
			.find('a.item-value')
			.map((i, el) =>
				$(el)
					.text()
					.trim()
			)
			.get(),
		actors: $('.item-details .item-container.item-full')
			.eq(1)
			.find('a.item-value')
			.map((i, el) =>
				$(el)
					.text()
					.trim()
			)
			.get(),
		links
	};
};

const getShowLinks = async uri => {
	let seasons;
	try {
		seasons = await getEpisodes(uri);
	} catch (error) {
		return null;
	}
	if (!seasons) return null;
	const data = await Promise.all(
		seasons.map(async (season, i) => {
			const episodes = await Promise.all(
				season.episodes.map(async (episode, j) => {
					const sources = await getLinks(episode);
					if (!sources) return null;
					return { episode: j + 1, sources };
				})
			);

			return { season: i + 1, episodes: episodes.filter(ep => !!ep || !!_.get(ep, 'sources')) };
		})
	);

	return data.filter(s => !!s || !!_.get(s, 'episodes.length'));
};

const writeToFile = (file, content) => {
	fs.writeFile(file, content, 'utf8', function(err) {
		if (err) {
			return console.log(err);
		}

		console.log('The file was saved!');
	});
};

const getMoviesOnPage = async page => {
	const urls = await getMoviesUrls(page);
	return await Promise.all(urls.map(async url => await getMovieData(url)));
};
const getShowsOnPage = async page => {
	const urls = await getShowUrls(page);
	return await Promise.all(urls.map(async url => await getMovieData(url)));
};
import map from 'lodash/fp/map';
import flatten from 'lodash/fp/flatten';
import flow from 'lodash/fp/flow';
import reduce from 'lodash/fp/reduce';

(async () => {
	const pages = 46;
	let data = [];
	for (let j = 1; j <= pages; j++) {
		let t0 = Date.now();
		const movies = await getMoviesOnPage(j);
		let t1 = Date.now();
		let diff = (t1 - t0) / 1000;
		t0 = Date.now();
		let eta = (pages - j) * diff;
		data = _.concat(data, movies);
		console.log(`Page ${j} done in ${diff} s / time remaning ${eta} s`);
		writeToFile(resolve(__dirname, '../data/data2.json'), JSON.stringify(data));
	}
})();
