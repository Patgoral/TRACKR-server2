const Attendee = require('../../models/attendee')
const aws = require('aws-sdk')
const fs = require('fs')
const polyline = require('polyline')
const sax = require('sax')
const heicConvert = require('heic-convert')


// Your finish segment, in the correct travel direction
const FINISH_SEGMENT = [
	[33.22871, -83.52579],
	[33.228742, -83.52557],
	[33.228777, -83.52534],
	[33.228814, -83.52509],
	[33.228853, -83.52484],
	[33.228894, -83.52458],
	[33.228934, -83.52436],
	[33.228955, -83.52420],
	[33.228969, -83.52409],
]

const SEGMENT_ARM_RADIUS_METERS = 25
const FINISH_LINE_NEAR_RADIUS_METERS = 30
const MIN_ARMED_MATCHES = 2

function toRad(deg) {
	return (deg * Math.PI) / 180
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
	const R = 6371000

	const dLat = toRad(lat2 - lat1)
	const dLon = toRad(lon2 - lon1)

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2)

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
	return R * c
}

function latLonToXY(lat, lon, refLat, refLon) {
	const metersPerDegLat = 111320
	const metersPerDegLon = 111320 * Math.cos(toRad(refLat))

	return {
		x: (lon - refLon) * metersPerDegLon,
		y: (lat - refLat) * metersPerDegLat,
	}
}

function subtractVec(a, b) {
	return { x: a.x - b.x, y: a.y - b.y }
}

function dot(a, b) {
	return a.x * b.x + a.y * b.y
}

function magnitude(a) {
	return Math.sqrt(a.x * a.x + a.y * a.y)
}

function interpolateTime(t1, t2, ratio) {
	const ms1 = new Date(t1).getTime()
	const ms2 = new Date(t2).getTime()

	if (Number.isNaN(ms1) || Number.isNaN(ms2)) return null
	if (ms2 < ms1) return new Date(ms1)

	const clampedRatio = Math.max(0, Math.min(1, ratio))
	return new Date(ms1 + (ms2 - ms1) * clampedRatio)
}

async function parseRideGpx(filePath) {
	return new Promise((resolve, reject) => {
		const gpxReadStream = fs.createReadStream(filePath, 'utf8')
		const saxStream = sax.createStream(true)

		const points = []
		let currentPoint = null
		let textBuffer = ''

		saxStream.on('opentag', (node) => {
			textBuffer = ''

			if (node.name === 'trkpt') {
				currentPoint = {
					lat: parseFloat(node.attributes.lat),
					lon: parseFloat(node.attributes.lon),
					time: null,
				}
			}
		})

		saxStream.on('text', (text) => {
			textBuffer += text
		})

		saxStream.on('cdata', (text) => {
			textBuffer += text
		})

		saxStream.on('closetag', (tagName) => {
			if (tagName === 'time' && currentPoint) {
				currentPoint.time = textBuffer.trim()
			}

			if (tagName === 'trkpt' && currentPoint) {
				points.push(currentPoint)
				currentPoint = null
			}

			textBuffer = ''
		})

		saxStream.on('end', () => resolve(points))
		saxStream.on('error', reject)
		gpxReadStream.on('error', reject)

		gpxReadStream.pipe(saxStream)
	})
}

function getSignedFinishProgress(point, finishSegment) {
	const finishPoint = finishSegment[finishSegment.length - 1]
	const prevFinishPoint = finishSegment[finishSegment.length - 2]

	const refLat = finishPoint[0]
	const refLon = finishPoint[1]

	const finishXY = latLonToXY(finishPoint[0], finishPoint[1], refLat, refLon)
	const prevFinishXY = latLonToXY(prevFinishPoint[0], prevFinishPoint[1], refLat, refLon)
	const pointXY = latLonToXY(point.lat, point.lon, refLat, refLon)

	const roadVec = subtractVec(finishXY, prevFinishXY)
	const roadLen = magnitude(roadVec)

	if (roadLen === 0) return null

	const rel = subtractVec(pointXY, finishXY)

	// negative = before finish
	// positive = after finish
	return dot(rel, roadVec) / roadLen
}

function analyzeFinishApproach(ridePoints, finishSegment) {
	const finishPoint = finishSegment[finishSegment.length - 1]

	let armed = false
	let armedAtRidePointIndex = -1
	let armedAtTime = null
	let armedMatches = 0
	let consecutiveArmMatches = 0

	const armPoints = finishSegment.slice(0, Math.max(2, finishSegment.length - 2))

	for (let i = 0; i < ridePoints.length; i++) {
		const point = ridePoints[i]

		let nearArmZone = false
		for (const segPoint of armPoints) {
			const dist = getDistanceMeters(point.lat, point.lon, segPoint[0], segPoint[1])
			if (dist <= SEGMENT_ARM_RADIUS_METERS) {
				nearArmZone = true
				break
			}
		}

		if (nearArmZone) {
			armedMatches++
			consecutiveArmMatches++

			if (!armed && consecutiveArmMatches >= MIN_ARMED_MATCHES) {
				armed = true
				armedAtRidePointIndex = i - consecutiveArmMatches + 1
				armedAtTime = ridePoints[armedAtRidePointIndex]?.time
					? new Date(ridePoints[armedAtRidePointIndex].time)
					: null
				break
			}
		} else {
			consecutiveArmMatches = 0
		}
	}

	let minDistanceToFinishMeters = Infinity
	let closestRidePointIndex = -1

	for (let i = 0; i < ridePoints.length; i++) {
		const point = ridePoints[i]
		const dist = getDistanceMeters(point.lat, point.lon, finishPoint[0], finishPoint[1])

		if (dist < minDistanceToFinishMeters) {
			minDistanceToFinishMeters = dist
			closestRidePointIndex = i
		}
	}

	return {
		armed,
		armedAtRidePointIndex,
		armedAtTime,
		armedMatches,
		minDistanceToFinishMeters,
		closestRidePointIndex,
	}
}

function detectFinishCrossingTime(ridePoints, finishSegment) {
	if (!ridePoints || ridePoints.length < 2 || !finishSegment || finishSegment.length < 2) {
		return {
			finishTime: null,
			finishDetected: false,
			reason: 'Not enough points',
		}
	}

	const approach = analyzeFinishApproach(ridePoints, finishSegment)
	const finishPoint = finishSegment[finishSegment.length - 1]

	if (!approach.armed) {
		return {
			finishTime: null,
			finishDetected: false,
			reason: 'Never approached finish segment from the expected side',
			progress: approach,
			matchMeta: null,
		}
	}

	const startIdx = Math.max(1, approach.armedAtRidePointIndex)
	for (let i = Math.max(1, startIdx); i < ridePoints.length; i++) {
		const p1 = ridePoints[i - 1]
		const p2 = ridePoints[i]

		if (!p1.time || !p2.time) continue

		const d1 = getDistanceMeters(p1.lat, p1.lon, finishPoint[0], finishPoint[1])
		const d2 = getDistanceMeters(p2.lat, p2.lon, finishPoint[0], finishPoint[1])

		if (d1 > FINISH_LINE_NEAR_RADIUS_METERS && d2 > FINISH_LINE_NEAR_RADIUS_METERS) {
			continue
		}

		const s1 = getSignedFinishProgress(p1, finishSegment)
		const s2 = getSignedFinishProgress(p2, finishSegment)

		if (s1 === null || s2 === null) continue

		if (s1 < 0 && s2 >= 0) {
			const denom = s2 - s1
			const ratio = denom === 0 ? 1 : (-s1 / denom)
			const finishTime = interpolateTime(p1.time, p2.time, ratio)

			return {
				finishTime,
				finishDetected: !!finishTime,
				reason: finishTime ? 'Finish line crossed' : 'Could not interpolate finish time',
				progress: approach,
				matchMeta: {
					crossingBetweenRidePointIndexes: [i - 1, i],
					crossingRatio: ratio,
					p1Time: p1.time,
					p2Time: p2.time,
					p1DistanceToFinishMeters: d1,
					p2DistanceToFinishMeters: d2,
					s1,
					s2,
				},
			}
		}
	}

	for (let i = startIdx; i < ridePoints.length; i++) {
		const p = ridePoints[i]
		if (!p.time) continue

		const d = getDistanceMeters(p.lat, p.lon, finishPoint[0], finishPoint[1])
		const s = getSignedFinishProgress(p, finishSegment)

		if (s === null) continue

		if (d <= 12 && s >= 0) {
			return {
				finishTime: new Date(p.time),
				finishDetected: true,
				reason: 'Fallback finish detection',
				progress: approach,
				matchMeta: {
					ridePointIndex: i,
					pointTime: p.time,
					distanceToFinishMeters: d,
					signedProgress: s,
				},
			}
		}
	}

	return {
		finishTime: null,
		finishDetected: false,
		reason: 'Did not cross finish line',
		progress: approach,
		matchMeta: null,
	}
}

function rideHasTimestamps(ridePoints) {
	if (!ridePoints || ridePoints.length === 0) return false

	for (const p of ridePoints) {
		if (p.time) return true
	}

	return false
}
// INDEX ALL ATTENDEES
async function index(req, res) {
  try {
    const { year } = req.query

    const filter = {}

    if (year) {
      const parsedYear = parseInt(year, 10)

      if (!Number.isNaN(parsedYear)) {
        const startOfYear = new Date(Date.UTC(parsedYear, 0, 1, 0, 0, 0, 0))
        const endOfYear = new Date(Date.UTC(parsedYear + 1, 0, 1, 0, 0, 0, 0))

        filter.createdAt = {
          $gte: startOfYear,
          $lt: endOfYear,
        }
      }
    }

    const attendees = await Attendee.find(filter)
      .select('-gpx')
      .sort({ createdAt: 1 })
      .lean()

    res.status(200).json({ attendees })
  } catch (error) {
    console.log(error)
    res.status(400).json(error)
  }
}

// SHOW USER ATTENDEES
async function show(req, res, next) {
	try {
		await Attendee.find({ owner: req.user._id })
			.then((attendees) => {
				return attendees
					.map((attendee) => attendee)
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW ANY ATTENDEES
async function showAll(req, res, next) {
	try {
		await Attendee.findById(req.params.id).then((attendees) => {
			res.status(200).json({ attendees: attendees })
		})
	} catch (error) {
		res.status(400).json(error)
	}
}

// POST
async function create(req, res, next) {
	try {
		let imageUrl, gpxUrl
		let finishTime = null
		let finishDetected = false
		let finishMatchMeta = null

		if (req.files) {
			aws.config.setPromisesDependency()
			aws.config.update({
				accessKeyId: process.env.AWS_ACCESS_KEY,
				secretAccessKey: process.env.AWS_SECRET_KEY,
				region: process.env.AWS_BUCKET_REGION,
			})
			const s3 = new aws.S3()

			if (req.files.image) {
				const imageFile = req.files.image[0]
				let imageBuffer = fs.readFileSync(imageFile.path)

				if (
					imageFile.mimetype === 'image/heic' ||
					imageFile.originalname.toLowerCase().endsWith('.heic')
				) {
					try {
						const jpgBuffer = await heicConvert({
							buffer: imageBuffer,
							format: 'JPEG',
							quality: 0.8,
						})

						const imageParams = {
							ACL: 'public-read',
							Bucket: process.env.AWS_BUCKET_NAME,
							Body: jpgBuffer,
							Key: `userImage/${imageFile.originalname.replace(/\.heic$/i, '.jpg')}`,
							ContentType: 'image/jpeg',
						}

						const imageData = await s3.upload(imageParams).promise()

						fs.unlinkSync(imageFile.path)
						imageUrl = imageData.Location
					} catch (error) {
						console.error('Error converting HEIC to JPG:', error)
						return res.status(500).send('Error converting the file.')
					}
				} else {
					const imageParams = {
						ACL: 'public-read',
						Bucket: process.env.AWS_BUCKET_NAME,
						Body: fs.createReadStream(imageFile.path),
						Key: `userImage/${imageFile.originalname}`,
					}

					const imageData = await s3.upload(imageParams).promise()
					fs.unlinkSync(imageFile.path)
					imageUrl = imageData.Location
				}
			}

			if (req.files.gpx) {
				const gpxFile = req.files.gpx[0]

				const ridePoints = await parseRideGpx(gpxFile.path)

				if (!ridePoints.length) {
					fs.unlinkSync(gpxFile.path)
					return res.status(400).json({ error: 'Uploaded GPX contains no track points.' })
				}

				gpxUrl = polyline.encode(
					ridePoints.map((point) => [point.lat, point.lon])
				)

				// Detect if timestamps exist
				const hasTimestamps = rideHasTimestamps(ridePoints)

				if (hasTimestamps) {
					const finishResult = detectFinishCrossingTime(ridePoints, FINISH_SEGMENT)

					finishTime = finishResult.finishTime
					finishDetected = finishResult.finishDetected

					finishMatchMeta = {
						reason: finishResult.reason,
						progress: finishResult.progress || null,
						matchMeta: finishResult.matchMeta || null,
					}
				} else {
					// Skip finish detection
					finishDetected = false
					finishTime = null

					finishMatchMeta = {
						reason: 'GPX contains no timestamp data — finish detection skipped'
					}
				}

				fs.unlinkSync(gpxFile.path)
			}
		}

		let attendeeData = {}
		if (req.body.attendee) {
			attendeeData = { ...req.body.attendee }

			if (imageUrl) {
				attendeeData.image = imageUrl
			}

			if (gpxUrl) {
				attendeeData.gpx = gpxUrl
			}

			attendeeData.finishTime = finishTime
			attendeeData.finishDetected = finishDetected
			attendeeData.finishMatchMeta = finishMatchMeta
		} else {
			attendeeData = {
				image: imageUrl,
				gpx: gpxUrl,
				finishTime,
				finishDetected,
				finishMatchMeta,
			}
		}

		const attendee = await Attendee.create(attendeeData)

		res.status(201).json({ attendee })
	} catch (error) {
		console.log('Error occurred while trying to upload to S3 bucket', error)
		res.status(400).json(error)
	}
}

// PATCH
async function patch(req, res, next) {
	try {
		const attendee = req.body.attendee
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.updateOne(req.body.attendee)
			})
			.then((attendee) => {
				res.status(202).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// DELETE
async function remove(req, res, next) {
	try {
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.deleteOne()
			})
			.then((attendee) => {
				res.status(204).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

module.exports = {
	index,
	show,
	create,
	patch,
	remove,
	showAll,
}
