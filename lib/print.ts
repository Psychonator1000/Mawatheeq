import type { CaseRecord } from './domain';
import type { WorkItem } from './office';
import type { MonthSummary } from './attendance';

/**
 * The office logo, traced as a vector from the original artwork: the tall alif, «م» with its flourishes, «ثيق» beneath
 * and the «و» in the accent colour. Ink is currentColor and the accent is the --logo-accent variable, so it takes every
 * theme's colours. Shared by the app and the printed letterhead.
 */
export const BRAND_MARK_VIEWBOX = '0 0 107.5 184.5';
const BRAND_INK = 'M22.9 183.5C22.6 183.4 21.9 183.3 21.5 183.1C21.0 183.0 20.3 182.8 19.9 182.7C18.1 182.2 15.2 180.5 13.3 178.7C11.3 176.8 9.2 173.3 8.2 170.1C7.4 167.6 7.3 166.6 7.3 160.9C7.3 155.7 7.3 155.7 7.7 154.1C7.8 153.3 8.1 152.0 8.1 151.3C8.2 150.6 8.4 149.8 8.6 149.3C8.7 148.8 9.0 147.9 9.1 147.3C9.2 146.6 9.4 145.9 9.7 145.2C10.8 143.0 11.0 141.9 10.5 140.5C10.2 139.4 10.2 138.8 10.5 137.3C10.6 136.7 10.8 135.7 10.9 135.2C11.0 133.9 11.3 133.2 11.7 132.5L12.1 132.0L12.8 132.3L13.5 132.5L13.5 133.4C13.5 134.9 13.7 136.0 14.1 136.8C14.7 137.9 15.9 139.2 16.8 139.6C18.6 140.6 19.9 140.1 21.3 138.2C22.2 137.0 22.3 136.9 22.7 136.9C23.1 136.9 23.3 137.3 23.2 137.8C23.1 138.7 20.1 143.1 18.7 144.6C17.4 145.9 17.2 145.9 15.5 145.9L14.1 145.9L13.1 145.4C11.5 144.5 11.0 144.7 10.8 146.4C10.8 146.9 10.6 147.7 10.5 148.2C10.1 149.5 10.0 150.3 9.9 152.6C9.8 153.6 9.7 154.9 9.5 155.3C9.3 156.4 9.3 158.6 9.5 159.6C9.6 160.0 9.8 160.9 9.9 161.6C10.5 165.0 12.4 168.4 14.9 170.4C16.5 171.7 19.8 173.1 21.6 173.4C22.9 173.6 27.0 173.6 28.4 173.4C31.2 173.0 36.2 171.1 39.4 169.2C41.4 168.0 42.9 167.0 43.6 166.5C46.5 164.4 50.7 161.2 52.2 159.9C53.2 159.1 54.5 158.1 54.9 157.7C57.1 156.1 60.2 153.1 62.2 150.8C64.1 148.6 64.2 148.4 64.2 147.8C64.2 147.0 62.8 145.9 60.3 144.9C59.9 144.7 59.2 144.7 54.8 144.7L49.7 144.7L48.4 144.2C45.1 143.0 43.7 141.7 42.8 138.9C42.4 137.7 42.2 134.8 42.5 133.7C43.2 130.4 43.4 129.7 43.9 128.7C45.0 126.6 46.0 125.4 48.4 123.4C50.6 121.7 51.8 121.2 54.4 121.2L56.1 121.2L57.3 121.8C61.0 123.6 63.8 126.6 66.1 131.4C67.1 133.3 67.4 133.4 69.8 132.5C70.4 132.3 71.6 131.9 72.3 131.6C73.1 131.4 74.0 131.0 74.5 130.9C75.4 130.5 75.9 130.6 76.3 131.2C76.5 131.5 76.6 131.8 76.6 133.4C76.8 136.9 77.6 138.6 79.7 139.6L80.7 140.1L82.4 140.0C83.9 140.0 84.2 140.0 85.3 139.7C87.8 138.9 89.7 137.9 90.2 137.0C90.7 136.1 90.4 135.3 88.3 131.8C87.3 130.1 87.2 129.5 87.4 128.3C87.5 127.8 87.8 127.0 88.1 126.5C88.3 126.0 88.5 125.4 88.6 125.1C88.6 124.9 88.8 124.5 88.9 124.2C89.8 122.3 91.1 123.2 92.6 126.7C93.1 127.9 93.2 128.5 93.3 130.6C93.4 133.6 93.2 134.8 92.4 137.2C91.1 141.3 89.5 143.7 87.1 145.3C85.0 146.8 84.1 147.1 81.1 147.0C77.0 147.0 75.5 146.3 74.0 143.4L73.5 142.3L73.4 140.4C73.3 137.9 73.0 137.3 71.8 137.3C71.1 137.3 69.6 137.9 68.9 138.4C68.1 139.1 68.0 139.7 68.1 141.8C68.1 143.2 68.1 143.9 68.0 144.9C67.9 145.6 67.7 146.6 67.6 147.2C67.5 148.2 67.2 149.5 66.5 151.8C65.8 154.2 64.7 156.2 63.4 157.7C63.0 158.2 62.3 159.0 61.9 159.4C61.1 160.5 53.6 167.9 51.9 169.4C51.2 170.0 50.1 171.0 49.4 171.4C48.8 171.9 47.3 173.1 46.0 174.0C44.8 174.9 43.5 175.9 43.2 176.1C42.8 176.3 42.1 176.8 41.6 177.1C39.9 178.3 36.8 180.1 34.9 180.9C33.6 181.5 30.6 182.6 30.4 182.6C30.3 182.6 29.4 182.8 28.5 183.0C26.6 183.5 24.3 183.7 22.9 183.5ZM69.7 173.7C66.3 171.9 66.3 171.7 68.2 169.1C70.6 165.9 70.7 165.7 70.3 164.9C70.0 164.3 69.6 164.0 67.6 162.8C65.4 161.4 65.2 161.2 65.3 160.5C65.4 159.9 65.9 159.2 67.8 156.7C69.3 155.0 69.5 154.8 70.3 154.9C70.9 155.0 71.3 155.2 73.6 156.6C75.2 157.6 75.5 158.3 74.8 159.3C74.7 159.5 73.8 160.7 73.0 161.9C71.3 164.4 71.1 164.7 71.3 165.2C71.4 165.5 72.6 166.4 73.4 166.8C74.1 167.2 76.3 168.6 76.5 168.8C77.0 169.5 76.5 170.2 74.0 173.2C72.3 175.2 72.3 175.2 69.7 173.7ZM80.6 163.5C80.5 163.5 80.4 163.4 80.4 163.3C80.4 163.1 80.5 163.1 82.3 162.3C83.1 162.0 84.0 161.6 84.4 161.4C84.8 161.2 85.4 160.9 85.8 160.8C86.1 160.7 87.1 160.3 87.9 159.9C88.8 159.5 89.7 159.1 90.1 159.0C92.2 158.2 96.5 156.0 98.1 154.9C99.1 154.2 99.5 154.1 99.5 154.5C99.5 155.1 98.7 155.9 96.3 157.8C94.8 158.9 89.8 161.6 87.7 162.3C87.0 162.6 86.1 162.8 85.4 162.9C84.7 162.9 83.7 163.1 83.1 163.2C81.9 163.5 80.9 163.6 80.6 163.5ZM24.9 157.2C24.4 156.7 23.1 155.4 22.1 154.4C20.2 152.5 20.0 152.2 20.0 151.8C20.0 151.4 20.4 150.6 20.8 150.3C20.9 150.2 21.6 149.3 22.4 148.3C24.6 145.3 24.6 145.3 28.1 148.8C30.3 151.1 31.1 151.6 32.0 151.4C32.6 151.3 33.6 150.3 35.2 148.1C35.9 147.2 36.6 146.3 36.8 146.2C37.3 146.0 37.7 146.2 39.8 148.4C43.5 152.0 43.4 152.0 41.9 154.0C39.1 157.8 38.9 158.0 38.2 157.8C37.9 157.7 37.1 157.0 35.9 155.8C33.7 153.6 32.8 153.0 32.1 153.0C30.9 153.0 30.5 153.4 28.7 155.8C26.9 158.2 26.8 158.2 26.3 158.3C25.9 158.3 25.7 158.1 24.9 157.2ZM102.4 154.0C101.8 153.8 101.2 153.6 101.0 153.6C100.5 153.6 100.2 153.5 100.2 153.3C100.2 152.9 101.0 151.6 101.6 150.9C102.8 149.3 102.4 147.9 100.4 146.7C99.1 145.9 98.7 145.3 99.0 144.8C99.4 144.0 100.3 144.3 101.7 145.6C102.2 146.1 102.8 146.6 103.0 146.7C103.2 146.9 103.5 147.3 103.6 147.6C103.8 148.1 104.1 148.3 105.1 149.0C106.5 150.0 106.8 152.5 105.6 153.6C104.8 154.5 104.0 154.6 102.4 154.0ZM31.5 137.0C31.4 136.8 31.4 135.3 31.4 133.6L31.3 130.7L32.1 130.3C33.7 129.3 34.3 129.0 34.4 129.1C34.7 129.7 34.3 132.4 33.5 135.2C33.2 136.2 32.4 137.4 32.0 137.5C31.7 137.5 31.6 137.5 31.5 137.0ZM57.4 134.9C58.1 134.2 57.2 133.0 54.8 131.5C52.2 129.7 50.2 129.8 48.4 131.6C47.2 132.8 47.3 133.7 48.6 134.4C49.8 135.0 50.6 135.1 54.0 135.1C57.0 135.1 57.1 135.1 57.4 134.9ZM16.8 122.4C16.4 122.3 16.4 122.2 16.5 121.7C16.6 121.0 17.0 120.3 17.9 119.3C18.2 118.9 18.7 118.3 19.0 117.9C20.0 116.5 20.8 115.8 20.8 116.4C20.8 116.7 20.1 117.8 19.3 119.1C19.0 119.7 18.4 120.6 18.2 121.1C17.4 122.4 17.3 122.5 16.8 122.4ZM83.6 122.4C83.3 122.3 79.7 119.6 79.1 119.0C78.5 118.4 78.5 118.0 79.1 116.4C79.8 115.1 80.9 113.2 81.3 112.9C81.9 112.5 82.4 112.7 83.9 113.7C84.6 114.2 85.5 114.9 85.9 115.2C88.0 117.0 88.3 117.0 89.4 115.4C90.0 114.5 90.2 114.1 91.3 112.2C92.1 110.9 92.6 110.7 93.5 111.3C94.6 112.1 98.1 115.2 98.3 115.5C98.6 116.1 98.5 116.4 97.3 118.5C96.2 120.5 95.7 121.1 95.3 121.1C94.7 121.2 94.4 121.1 92.9 120.0C92.0 119.4 90.9 118.7 90.3 118.3C89.5 117.7 89.3 117.6 88.8 117.6C87.7 117.6 87.3 118.1 85.8 120.6C84.8 122.3 84.3 122.7 83.6 122.4ZM30.9 119.5C30.8 119.2 30.7 118.1 30.7 117.1C30.5 112.8 30.4 111.3 30.2 110.8C30.1 110.4 30.0 109.8 30.0 109.1C30.0 108.5 29.9 107.5 29.9 106.9C29.8 106.4 29.8 105.5 29.9 105.1C29.9 104.6 29.9 103.1 29.8 101.7C29.7 100.3 29.6 98.6 29.6 97.8C29.5 97.0 29.4 96.1 29.3 95.7C29.2 95.2 29.1 94.4 29.1 93.7C29.1 92.3 29.0 89.5 28.7 86.0C28.6 84.8 28.6 83.4 28.6 82.8C28.6 82.2 28.5 81.4 28.4 80.6C28.2 79.7 28.1 78.5 28.0 75.2C27.9 72.6 27.8 70.7 27.7 70.0C27.6 69.4 27.5 68.7 27.5 68.5C27.5 68.2 27.4 67.5 27.3 66.8C27.1 65.8 27.1 64.5 26.7 57.8C26.7 56.3 26.5 54.5 26.4 53.8C26.3 53.0 26.2 51.2 26.1 49.7C25.9 45.3 25.6 40.5 25.4 40.2C25.4 40.1 25.3 38.7 25.2 37.1C25.2 33.8 24.9 30.0 24.6 28.1C24.5 27.5 24.4 26.6 24.4 26.1C24.4 25.6 24.3 24.7 24.3 24.0C24.2 23.4 24.1 21.2 24.0 19.2C23.9 16.4 23.8 15.3 23.6 14.6C23.5 14.1 23.3 13.0 23.3 12.2C23.2 11.0 23.1 10.6 22.8 9.9C22.1 8.5 22.2 8.2 23.4 5.7C24.6 3.4 25.9 1.5 26.5 1.2C27.2 0.8 27.4 1.1 28.3 3.3C28.7 4.3 29.5 6.5 30.1 8.0C32.2 13.2 33.4 16.8 34.3 20.4C34.4 21.0 34.7 21.9 34.8 22.4C35.6 25.1 35.5 26.7 34.4 26.3C34.1 26.2 33.2 25.1 32.3 23.8C31.4 22.5 30.6 22.2 30.1 22.9C29.8 23.2 29.8 23.3 30.0 24.6C30.2 25.3 30.3 26.3 30.3 26.7C30.3 27.1 30.3 28.0 30.4 28.7C30.6 29.4 30.6 30.2 30.6 30.7C30.5 31.1 30.5 32.0 30.6 32.8C30.7 33.5 30.8 35.8 30.9 37.8C31.0 40.3 31.1 41.8 31.2 42.4C31.4 43.3 31.6 45.3 31.7 50.2C31.9 53.5 32.0 54.7 32.3 56.6C32.5 57.4 32.5 58.5 32.5 60.7C32.5 65.3 32.8 69.1 33.3 71.6C33.5 72.3 33.5 74.0 33.6 78.2C33.8 84.8 33.9 86.8 34.2 88.2C34.3 89.0 34.4 90.0 34.4 92.8C34.5 96.2 34.6 98.5 34.9 101.9C35.0 102.7 35.0 103.8 34.9 104.4C34.8 105.3 34.8 105.8 35.0 106.9C35.2 107.9 35.3 109.2 35.3 112.4C35.4 115.4 35.5 116.7 35.6 117.1C35.7 117.3 35.7 117.6 35.6 117.6C35.4 117.7 34.2 118.5 33.6 119.0C33.1 119.4 32.2 119.8 31.4 120.0C31.0 120.1 31.0 120.1 30.9 119.5ZM67.3 113.4C66.9 113.2 66.4 112.6 66.2 112.1C65.8 111.3 65.9 108.6 66.3 107.4C66.7 106.4 67.0 105.7 67.4 105.5C67.7 105.3 67.7 105.3 67.9 106.4C68.4 108.6 69.5 109.5 71.1 108.8C71.7 108.5 71.8 108.6 71.5 109.3C71.3 110.0 71.2 110.2 69.9 111.9C68.8 113.4 68.1 113.7 67.3 113.4ZM86.6 111.4C86.4 111.3 85.6 110.8 84.8 110.2C84.0 109.7 83.0 108.9 82.5 108.6C81.1 107.6 81.0 107.0 81.9 105.5C82.2 105.0 82.7 104.1 83.0 103.5C84.3 101.1 84.9 100.9 86.5 102.5C87.0 102.9 87.8 103.6 88.4 104.0C90.0 105.2 90.8 106.0 90.8 106.5C90.8 106.9 90.3 107.7 88.7 110.2C87.8 111.6 87.4 111.9 86.6 111.4ZM15.8 109.8C14.3 108.7 14.3 105.3 16.0 102.7C16.5 101.8 16.7 101.8 16.8 102.7C16.9 103.5 17.5 104.8 18.0 105.1C18.6 105.6 19.1 105.6 19.9 105.2C20.7 104.8 20.9 104.9 20.9 105.3C20.9 106.1 18.8 109.3 17.8 109.9C17.2 110.2 16.4 110.2 15.8 109.8ZM61.0 100.3C61.5 98.8 62.0 96.7 62.1 96.0C62.2 95.6 62.4 94.8 62.6 94.2C63.0 93.1 63.0 93.0 63.1 90.5L63.2 87.9L64.8 86.8C65.7 86.2 67.2 85.1 68.1 84.3C69.0 83.6 70.4 82.3 71.3 81.6C72.2 80.9 73.4 79.9 73.9 79.4C74.4 79.0 75.3 78.2 76.0 77.6C76.6 77.1 77.7 76.2 78.3 75.7C79.6 74.5 82.5 72.4 84.1 71.7C84.7 71.5 85.7 71.1 86.4 70.9C88.7 70.3 88.6 70.3 90.2 70.7L91.7 71.0L92.7 72.1C93.9 73.3 94.9 75.0 95.1 76.4C95.2 76.8 95.4 77.7 95.6 78.2C95.9 79.1 95.9 79.6 96.0 81.1C96.0 83.2 95.9 83.7 95.0 87.4C94.7 88.8 93.6 91.2 93.0 92.2C92.6 92.6 91.6 93.1 90.7 93.2C90.3 93.2 89.4 93.4 88.7 93.5C86.9 93.7 85.2 93.6 83.7 93.1C82.2 92.6 82.0 92.5 80.8 91.6C78.2 89.7 77.0 88.5 75.6 86.2C75.2 85.7 74.9 85.2 74.8 85.2C74.2 84.7 73.1 85.4 70.1 88.3C67.0 91.4 65.2 92.8 63.7 93.5C62.7 93.9 62.6 94.3 62.4 96.1C62.3 96.8 62.2 97.6 62.0 97.9C61.9 98.2 61.6 98.9 61.4 99.5C61.3 100.0 61.1 100.5 61.0 100.5C61.0 100.5 61.0 100.4 61.0 100.3ZM89.9 85.1C90.7 84.8 91.0 84.2 90.8 83.3C90.3 81.0 88.8 79.3 86.5 78.3C84.1 77.3 81.9 77.5 80.6 78.6C79.8 79.3 79.9 79.9 81.0 81.2C83.3 84.0 87.9 86.1 89.9 85.1ZM41.1 57.1C39.2 56.1 38.5 55.2 38.5 54.0C38.5 53.4 39.3 50.8 39.7 50.0C40.4 48.5 41.8 47.5 44.8 46.1C45.8 45.6 46.7 45.2 46.8 45.1C47.1 44.9 50.2 43.8 50.9 43.6C51.4 43.5 51.9 43.4 52.2 43.2C52.4 43.1 53.0 42.9 53.5 42.8C54.0 42.7 54.7 42.5 55.0 42.3C55.3 42.1 55.9 41.9 56.2 41.9C56.8 41.7 58.2 41.3 60.8 40.5C61.6 40.2 62.6 39.9 63.0 39.8C63.5 39.7 64.2 39.5 64.6 39.3C65.1 39.1 65.8 38.8 66.3 38.8C67.1 38.6 68.8 38.1 70.9 37.4C71.6 37.2 72.7 36.9 73.3 36.8C73.8 36.7 74.7 36.5 75.2 36.3C75.7 36.2 76.4 36.0 76.9 36.0C77.7 35.9 78.9 35.5 82.1 34.6C86.9 33.1 88.6 32.6 88.9 32.7C89.5 32.9 89.2 33.7 88.2 34.6C87.5 35.3 86.3 35.8 85.2 36.0C84.7 36.0 83.6 36.4 82.7 36.7C81.8 37.0 80.6 37.4 79.9 37.6C79.3 37.8 78.5 38.1 78.2 38.2C77.8 38.4 77.1 38.6 76.5 38.8C75.8 38.9 75.0 39.1 74.6 39.3C74.2 39.5 73.5 39.7 72.9 39.7C72.4 39.8 71.6 40.0 71.1 40.2C70.7 40.4 69.9 40.6 69.3 40.8C68.7 41.0 67.2 41.4 66.0 41.9C64.8 42.3 63.5 42.7 63.1 42.8C62.8 42.8 62.1 43.1 61.6 43.3C61.1 43.4 60.3 43.7 59.8 43.7C59.4 43.8 58.7 44.0 58.3 44.2C57.9 44.4 57.3 44.6 56.9 44.7C56.5 44.7 55.9 44.9 55.6 45.1C55.2 45.3 54.6 45.5 54.1 45.6C53.7 45.7 53.0 45.9 52.7 46.1C52.4 46.2 51.1 46.7 49.8 47.0C44.9 48.3 41.0 50.3 41.0 51.5C41.0 52.2 41.3 52.6 42.3 53.1C43.7 53.8 44.5 54.5 44.5 55.2C44.5 55.9 44.0 57.4 43.7 57.6C43.2 57.9 42.6 57.8 41.1 57.1ZM48.2 53.8C47.9 53.1 49.0 51.5 50.4 50.8C53.1 49.4 61.0 46.4 61.9 46.4C62.0 46.4 64.4 45.6 68.9 44.2C69.4 44.0 70.2 43.8 70.6 43.7C71.1 43.6 71.7 43.4 72.1 43.2C72.5 43.0 73.1 42.8 73.6 42.8C74.0 42.7 74.5 42.5 74.9 42.4C75.8 42.0 79.0 40.9 79.9 40.7C80.8 40.5 82.4 40.0 84.1 39.3C84.5 39.1 85.2 38.8 85.6 38.7C86.0 38.7 86.5 38.5 86.8 38.4C87.5 38.0 88.2 38.0 88.3 38.4C88.4 38.8 87.7 40.1 87.0 40.8C86.4 41.5 84.8 42.2 83.4 42.6C82.9 42.7 82.3 42.8 82.1 42.9C78.5 44.1 75.5 45.1 74.9 45.4C73.9 45.7 72.1 46.2 70.8 46.6C68.5 47.1 67.4 47.4 65.8 47.9C64.2 48.4 61.4 49.4 60.6 49.7C60.4 49.8 59.4 50.2 58.4 50.5C57.5 50.9 56.1 51.4 55.4 51.6C54.8 51.9 54.0 52.1 53.9 52.2C53.4 52.3 50.7 53.4 49.9 53.8C49.0 54.2 48.4 54.2 48.2 53.8Z';
const BRAND_ACCENT = 'M16.6 134.0C15.8 133.9 12.4 132.8 11.7 132.5C11.2 132.3 10.4 131.9 9.9 131.5C8.6 130.6 5.7 127.8 5.0 126.7C4.3 125.7 3.3 123.7 3.1 123.1C3.0 122.8 2.8 122.2 2.6 121.7C2.2 120.9 1.8 119.5 1.3 116.8C0.9 114.9 1.1 105.3 1.6 102.8C1.7 102.3 1.8 101.3 1.9 100.6C2.0 99.4 2.1 99.3 3.1 97.3C3.3 96.9 3.5 96.2 3.7 95.7C3.8 95.1 4.1 94.5 4.2 94.3C4.4 93.9 4.5 93.9 5.3 93.9C6.3 93.9 6.4 93.9 6.4 96.4C6.4 98.2 6.4 98.4 6.1 99.1C5.8 99.8 5.7 100.2 5.6 101.9C5.6 103.0 5.4 104.7 5.3 105.5C5.0 107.7 5.1 109.3 5.6 110.8C6.2 112.6 6.7 114.4 6.9 114.9C7.1 115.8 8.0 117.0 9.6 118.5C9.8 118.8 10.4 119.2 10.9 119.5C11.4 119.7 12.0 120.1 12.4 120.4C13.0 120.9 13.7 121.2 14.8 121.3C15.1 121.4 16.5 121.7 17.8 122.0C20.1 122.6 20.2 122.6 21.1 122.5C22.2 122.3 23.4 122.0 24.0 121.8C24.2 121.7 24.9 121.5 25.5 121.4C26.7 121.2 27.6 120.9 29.0 120.2C29.4 120.0 30.2 119.7 30.7 119.6C31.9 119.3 32.7 118.9 33.5 118.2C33.9 117.9 34.4 117.5 34.8 117.3C35.1 117.1 35.8 116.7 36.2 116.3C36.7 115.9 37.6 115.3 38.2 115.0C39.4 114.4 41.4 112.9 43.0 111.5C44.6 110.1 44.8 109.9 45.9 109.2C46.4 108.9 47.2 108.2 47.7 107.8C48.2 107.3 48.7 106.9 48.9 106.8C49.7 106.4 51.0 105.2 51.4 104.5C51.8 103.9 53.2 102.5 55.6 100.3C57.2 98.9 57.5 98.6 57.6 98.3C57.8 97.5 57.0 96.8 55.5 96.4C55.0 96.3 54.4 96.1 54.1 95.9C53.2 95.2 52.7 95.1 49.6 95.1C48.1 95.2 46.4 95.2 45.9 95.2C44.5 95.2 41.1 94.5 40.2 94.0C39.6 93.7 38.3 92.0 37.8 91.1C37.0 89.6 36.8 87.0 37.2 84.6C37.3 83.9 37.4 82.6 37.5 81.5C37.6 80.0 37.7 79.3 38.0 78.3C38.4 76.8 38.7 76.4 39.9 75.1C40.3 74.6 41.2 73.6 41.7 73.0C42.3 72.3 42.9 71.7 43.0 71.6C43.6 71.3 46.8 69.9 47.6 69.7C48.2 69.6 49.6 69.7 50.3 70.0C50.6 70.1 51.3 70.3 51.8 70.5C52.9 70.8 54.5 71.5 54.9 71.9C55.1 72.0 55.6 72.5 56.2 73.0C57.3 74.0 57.3 74.0 58.2 75.2C58.5 75.7 59.2 76.5 59.8 77.0C60.6 77.8 60.8 78.1 61.0 78.8C61.2 79.3 61.6 80.2 61.9 80.9C62.5 82.1 62.8 83.1 63.1 84.9C63.2 85.3 63.3 86.2 63.5 86.8C63.6 87.7 63.6 88.6 63.6 90.8C63.5 93.5 63.5 93.6 63.1 94.7C62.9 95.3 62.7 96.1 62.6 96.5C62.5 97.0 62.3 98.1 62.0 99.1C61.7 100.2 61.4 101.7 61.3 102.8C61.0 104.9 60.8 105.6 59.9 106.6C59.3 107.3 58.9 107.9 58.6 108.5C58.2 109.1 57.9 109.5 57.2 110.0C56.4 110.7 54.2 113.0 53.8 113.6C53.3 114.3 52.5 115.1 51.5 115.9C51.0 116.3 50.1 117.1 49.5 117.8C48.4 119.1 47.6 119.8 46.9 120.3C46.4 120.6 45.5 121.3 43.9 122.9C42.7 124.0 41.6 124.9 40.9 125.3C39.2 126.3 38.4 126.8 36.8 128.0C35.8 128.8 34.6 129.6 34.1 129.8C33.7 130.1 32.8 130.6 32.3 130.9C31.7 131.3 30.9 131.7 30.5 131.8C30.0 131.9 29.2 132.2 28.7 132.4C28.2 132.6 27.3 132.8 26.7 132.9C26.2 133.0 25.3 133.2 24.9 133.3C23.4 133.9 22.9 134.0 19.8 134.1C18.2 134.1 16.8 134.1 16.6 134.0ZM50.0 83.4C50.0 83.4 49.5 83.0 48.9 82.7C48.3 82.3 47.5 81.8 47.0 81.5C45.7 80.6 45.2 80.7 44.2 82.1C44.0 82.3 43.9 82.6 43.9 82.7C43.9 83.0 44.5 83.3 45.4 83.4C46.4 83.6 50.0 83.6 50.0 83.4Z';
export function brandMarkSvg(accent = 'var(--logo-accent, #8a2d2a)') {
  return `<svg viewBox="${BRAND_MARK_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill="${accent}" d="${BRAND_ACCENT}"/><path fill="currentColor" d="${BRAND_INK}"/></svg>`;
}

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const dmy = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
const sections: [string, [keyof CaseRecord, string, boolean?][]][] = [
  ['بيانات القضية', [['code', 'كود المكتب'], ['autoNumber', 'الرقم الآلي'], ['caseNumber', 'رقم القضية'], ['court', 'المحكمة'], ['subject', 'موضوع الدعوى'], ['lawyer', 'المحامي']]],
  ['الأطراف', [['clientEntityName', 'الموكل'], ['clientContactName', 'المتابع لدى الموكل'], ['role', 'صفة الموكل'], ['opponent', 'الخصم'], ['casePerson', 'الشخص المعني'], ['casePersonRole', 'صلته بالموكل']]],
  ['الحكم', [['type', 'نوع الحكم'], ['date', 'تاريخ الحكم', true], ['outcome', 'نتيجة الحكم'], ['ruling', 'منطوق الحكم']]],
  ['الطعن والتنفيذ', [['appealRecorded', 'الطعن المسجل'], ['appealConfirmation', 'تأكيد إجراء الخصم'], ['copyDate', 'استلام الصيغة', true], ['notificationDate', 'إعلان الصيغة', true], ['announcementDate', 'بداية الإعلان', true], ['executionOpenDate', 'فتح التنفيذ', true], ['executionProcedureDate', 'إجراء التنفيذ', true], ['executionStage', 'مرحلة التنفيذ'], ['executionNote', 'ملاحظات التنفيذ']]],
  ['ملاحظات', [['notes', 'ملاحظات']]],
];

/** A self-contained, escaped HTML case summary for printing or saving as PDF. */
export function caseSheetHtml(c: CaseRecord, timing: { label: string; value: string }[], work: WorkItem[], printedAt: string, printedBy: string): string {
  const client = c.clientEntityName || c.clientGroup || c.client;
  const rows = (fields: [keyof CaseRecord, string, boolean?][]) => fields
    .map(([key, label, date]) => [label, key === 'clientEntityName' ? client : date ? dmy(String(c[key] || '')) : c[key]] as const)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`).join('');
  const body = sections.map(([title, fields]) => { const r = rows(fields); return r ? `<h2>${escape(title)}</h2><table>${r}</table>` : ''; }).join('');
  const timingRows = timing.map(t => `<tr><th>${escape(t.label)}</th><td>${escape(t.value)}</td></tr>`).join('');
  const procedures = (c.procedures || []).filter(p => p.text || p.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const procedureRows = procedures.map(p => `<tr><td class="nowrap">${escape(dmy(p.date))}</td><td>${escape(p.text)}</td><td>${escape(p.lawyer)}</td><td class="nowrap">${escape(dmy(p.followup || ''))}</td></tr>`).join('');
  const open = work.filter(w => w.caseId === c.id && w.status !== 'done' && w.status !== 'cancelled').sort((a, b) => (a.dueDate + a.dueTime).localeCompare(b.dueDate + b.dueTime));
  const stages = Array.isArray(c.stages) ? c.stages as { level: string; caseNumber: string; court: string; date: string; outcome: string; ruling: string; appealedBy: string; procedures?: { date: string; text: string }[] }[] : [];
  const stageRows = stages.map(st => `<tr><td class="nowrap">${escape(st.level === 'ابتدائي' ? 'أول درجة' : st.level)}</td><td class="nowrap">${escape(st.caseNumber)}</td><td>${escape(st.court)}</td><td class="nowrap">${escape(dmy(st.date))}</td><td>${escape(st.outcome)}</td><td>${escape(st.ruling)}</td><td>${escape(st.appealedBy)}</td><td>${(st.procedures || []).length}</td></tr>`).join('');
  const workRows = open.map(w => `<tr><td class="nowrap">${escape(dmy(w.dueDate))} ${escape(w.dueTime)}</td><td>${escape(w.kind === 'hearing' ? 'جلسة' : 'مهمة')}</td><td>${escape(w.title)}</td><td>${escape(w.location)}</td></tr>`).join('');
  return page('ملف القضية ' + (c.code || c.autoNumber || ''), `<header><h1>${escape(client || 'ملف قضية')}</h1><p>${escape([c.code, c.autoNumber && 'الرقم الآلي ' + c.autoNumber, c.opponent && 'ضد ' + c.opponent].filter(Boolean).join(' · '))}</p></header>
${timingRows ? `<h2>المواعيد المحسوبة</h2><table>${timingRows}</table>` : ''}${body}
${stageRows ? `<h2>درجات التقاضي السابقة</h2><table class="list"><tr><th>الدرجة</th><th>رقم القضية</th><th>المحكمة</th><th>تاريخ الحكم</th><th>النتيجة</th><th>المنطوق</th><th>الطاعن</th><th>الإجراءات</th></tr>${stageRows}</table>` : ''}
${procedureRows ? `<h2>سجل الإجراءات</h2><table class="list"><tr><th>التاريخ</th><th>الإجراء</th><th>المحامي</th><th>المتابعة</th></tr>${procedureRows}</table>` : ''}
${workRows ? `<h2>المهام والجلسات المفتوحة</h2><table class="list"><tr><th>الموعد</th><th>النوع</th><th>العمل</th><th>المكان</th></tr>${workRows}</table>` : ''}
${footer(printedAt, printedBy)}`);
}

const footer = (printedAt: string, printedBy: string) => `<footer><span>طُبع من نظام مواثيق في ${escape(printedAt)}${printedBy ? ' بواسطة ' + escape(printedBy) : ''}</span><span>ملف داخلي سري</span></footer>`;
/** The office logo (the same vector mark as in the app), with «و» in the logo's maroon. */
const SEAL = `<div class="seal" aria-hidden="true">${brandMarkSvg('#8a2d2a')}</div>`;
/**
 * Printed pages have no browser margin, so the browser cannot add its own header and footer (page address, title, date).
 * The page spacing comes instead from a frame table whose empty head and foot rows repeat on every printed page. The
 * frame's single row must be allowed to break across pages, or the browser moves it to page 2 and leaves page 1 blank.
 */
function page(title: string, body: string, landscape = false) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700&family=Cinzel:wght@600&family=Cormorant+Garamond:wght@600;700&family=Noto+Kufi+Arabic:wght@600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap"><style>
@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;color:#2a201b;margin:0;padding:0 13mm;font-size:12.5px;line-height:1.55;background:#fff}
@media screen{body{padding:26px 34px}.print-frame>thead,.print-frame>tfoot{display:none}}
.print-frame{width:100%;border-collapse:collapse}.print-frame>thead td,.print-frame>tfoot td{height:11mm;border:0;padding:0;background:none}.print-frame>tbody>tr{break-inside:auto}.print-frame>tbody>tr>td{border:0;padding:0;background:none}
.watermark{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;opacity:.035;z-index:-1;font-family:'Aref Ruqaa',serif;font-weight:700;font-size:190px;color:#5a1a2b}
.brand{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:10px;border-bottom:2px solid #6e1f33;position:relative;margin-bottom:6px}
.brand::after{content:'';position:absolute;left:0;right:0;bottom:-5px;height:1px;background:#c9a24a}
.brand-id{display:flex;align-items:center;gap:14px}
.seal{width:42px;height:74px;flex-shrink:0;color:#1d1714}.seal svg{width:100%;height:100%;overflow:visible}
.brand-name strong{display:block;font-family:'Noto Kufi Arabic','Noto Sans Arabic',Tahoma,sans-serif;font-size:15.5px;font-weight:700;color:#5a1a2b;line-height:1.45}
.brand-name small{display:block;font-family:'Cinzel','Cormorant Garamond',Georgia,serif;font-size:9.5px;letter-spacing:.14em;color:#a8873e;font-weight:700;direction:ltr;text-align:right}
.brand-meta{font-size:10px;color:#8a7568;text-align:left;line-height:1.7}
header{margin:16px 0 10px}h1{font-family:'Noto Kufi Arabic','Noto Sans Arabic',Tahoma,sans-serif;font-size:19px;font-weight:700;margin:0;color:#2a201b}header p{margin:3px 0 0;color:#76645a;font-size:11.5px}
h2{font-size:13px;color:#6e1f33;margin:16px 0 6px;padding-inline-start:8px;border-inline-start:3px solid #c9a24a;break-after:avoid}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #e3d8ca;padding:5px 7px;text-align:right;vertical-align:top;overflow-wrap:anywhere}
th{background:#f6efe5;width:28%;font-weight:600;color:#4a3a30}.list th{width:auto}
.list thead th{background:#6e1f33;color:#fff;border-color:#6e1f33;font-weight:600;font-size:.95em}
.list thead{display:table-header-group}.list tbody tr{break-inside:avoid}.list tbody tr:nth-child(even) td{background:#fbf8f3}
.nowrap{white-space:nowrap}.amount{direction:ltr;text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}
.total td,.total th{font-weight:700;background:#f3e9dc}.signatures{display:flex;justify-content:space-between;gap:24px;margin-top:48px}.signatures div{flex:1;border-top:1px solid #8a7a70;padding-top:6px;text-align:center;color:#6b5a50}
.void{color:#a32e38;font-weight:700;border:2px solid #a32e38;padding:6px 10px;display:inline-block;margin-top:8px}
footer{margin-top:18px;padding-top:8px;border-top:1px solid #e3d8ca;display:flex;justify-content:space-between;gap:12px;color:#8a7a70;font-size:10px}
</style></head><body><div class="watermark" aria-hidden="true">مواثيق</div><table class="print-frame"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
<div class="brand"><div class="brand-id">${SEAL}<div class="brand-name"><strong>مواثيق للاستشارات القانونية وأعمال المحاماة</strong><small>MAWATHEEQ · LEGAL CONSULTANTS &amp; LAW FIRM</small></div></div><div class="brand-meta">${escape(title)}<br>للاستخدام الداخلي</div></div>
${body}</td></tr></tbody></table></body></html>`;
}

type Money = (minor: string | bigint, currency: string) => string;
type LedgerEntry = { id: string; caseId: string; payload: { type: 'fee' | 'receipt' | 'expense'; date: string; currency: string; amountMinor: string; reference: string; party: string; notes: string; status: 'posted' | 'void'; voidReason: string } };
const ENTRY_LABELS = { fee: 'أتعاب مستحقة', receipt: 'مقبوضات', expense: 'مصروفات' };
const VOUCHERS = { fee: 'إشعار أتعاب مستحقة', receipt: 'سند قبض', expense: 'سند صرف' };

/** A receipt, payment or fee voucher for one ledger entry. Void entries are clearly marked. */
export function voucherHtml(entry: LedgerEntry, caseLabel: string, money: Money, words: string, printedAt: string, printedBy: string): string {
  const p = entry.payload, title = VOUCHERS[p.type];
  const party = p.type === 'receipt' ? 'استلمنا من' : p.type === 'expense' ? 'صُرف إلى' : 'مستحق على';
  const rows: [string, string][] = [['رقم المرجع', p.reference], ['التاريخ', dmy(p.date)], [party, p.party], ['المبلغ', money(p.amountMinor, p.currency)], ['المبلغ كتابةً', words], ['القضية', caseLabel], ['البيان', p.notes]];
  return page(title + ' ' + p.reference, `<header><h1>${escape(title)}</h1><p>مواثيق للمحاماة</p>${p.status === 'void' ? `<p class="void">قيد ملغى — ${escape(p.voidReason)}</p>` : ''}</header>
<table>${rows.filter(([, v]) => String(v || '').trim()).map(([k, v]) => `<tr><th>${escape(k)}</th><td${k === 'المبلغ' ? ' class="amount"' : ''}>${escape(v)}</td></tr>`).join('')}</table>
<div class="signatures"><div>المستلم</div><div>المحاسب</div><div>الختم</div></div>${footer(printedAt, printedBy)}`);
}

/** A statement of posted entries in one currency, with fee, receipt and expense totals. */
export function statementHtml(entries: LedgerEntry[], currency: string, scope: string, caseLabel: (id: string) => string, money: Money, printedAt: string, printedBy: string): string {
  const posted = entries.filter(e => e.payload.status === 'posted' && e.payload.currency === currency).sort((a, b) => a.payload.date.localeCompare(b.payload.date) || a.id.localeCompare(b.id));
  const totals = { fee: BigInt(0), receipt: BigInt(0), expense: BigInt(0) };
  for (const e of posted) totals[e.payload.type] += BigInt(e.payload.amountMinor);
  const cell = (e: LedgerEntry, type: keyof typeof totals) => `<td class="amount">${e.payload.type === type ? escape(money(e.payload.amountMinor, currency)) : ''}</td>`;
  const rows = posted.map(e => `<tr><td class="nowrap">${escape(dmy(e.payload.date))}</td><td>${escape(e.payload.reference)}</td><td>${escape(ENTRY_LABELS[e.payload.type])}</td><td>${escape(e.payload.party)}</td><td>${escape(caseLabel(e.caseId))}</td>${cell(e, 'fee')}${cell(e, 'receipt')}${cell(e, 'expense')}</tr>`).join('');
  const sum = (v: bigint) => `<td class="amount">${escape(money(v, currency))}</td>`;
  return page('كشف حساب ' + currency, `<header><h1>كشف حساب</h1><p>${escape(scope)} · العملة ${escape(currency)} · ${posted.length} قيد مرحّل</p></header>
<table class="list"><tr><th>التاريخ</th><th>المرجع</th><th>الحركة</th><th>الطرف</th><th>القضية</th><th>أتعاب</th><th>مقبوضات</th><th>مصروفات</th></tr>${rows || '<tr><td colspan="8">لا توجد قيود مرحلة ضمن التصفية.</td></tr>'}
<tr class="total"><th colspan="5">الإجمالي</th>${sum(totals.fee)}${sum(totals.receipt)}${sum(totals.expense)}</tr></table>
<table><tr class="total"><th>الأتعاب المتبقية (الأتعاب − المقبوضات)</th>${sum(totals.fee - totals.receipt)}</tr><tr><th>صافي المقبوضات بعد المصروفات</th>${sum(totals.receipt - totals.expense)}</tr></table>
<p>القيود الملغاة لا تدخل في الكشف.</p>${footer(printedAt, printedBy)}`);
}

type PayrollRow = Pick<MonthSummary, 'scheduledDays' | 'presentDays' | 'absentDays' | 'leaveDays' | 'lateDays' | 'lateMinutes' | 'earlyMinutes' | 'excessMinutes' | 'overtimeMinutes' | 'salaryMinor' | 'lateDeductionMinor' | 'absenceDeductionMinor' | 'overtimePayMinor' | 'netMinor' | 'potentialDeductionMinor' | 'warnings'> & { employee: { name: string; employeeNumber: string; currency: string } };
const hm = (n: number) => n <= 0 ? '0' : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

/** Monthly payroll estimate grouped by currency. In warning mode deductions are listed as potential only. */
export function payrollHtml(rows: PayrollRow[], monthLabel: string, deductionMode: 'warn' | 'deduct', money: Money, printedAt: string, printedBy: string): string {
  const currencies = [...new Set(rows.map(r => r.employee.currency))].sort();
  const tables = currencies.map(currency => {
    const list = rows.filter(r => r.employee.currency === currency);
    const sum = (k: 'salaryMinor' | 'lateDeductionMinor' | 'absenceDeductionMinor' | 'overtimePayMinor' | 'netMinor' | 'potentialDeductionMinor') => list.reduce((t, r) => t + r[k], BigInt(0));
    const amount = (v: bigint) => `<td class="amount">${escape(money(v, currency))}</td>`;
    const body = list.map(r => `<tr><td>${escape(r.employee.name)}<br><small>${escape(r.employee.employeeNumber)}</small></td><td>${r.presentDays}/${r.scheduledDays}</td><td>${r.absentDays}</td><td>${r.leaveDays}</td><td class="nowrap">${r.lateDays} · ${escape(hm(r.lateMinutes + r.earlyMinutes))}</td><td class="nowrap">${escape(hm(r.excessMinutes))}</td><td class="nowrap">${escape(hm(r.overtimeMinutes))}</td>${amount(r.salaryMinor)}${amount(deductionMode === 'deduct' ? r.lateDeductionMinor + r.absenceDeductionMinor : r.potentialDeductionMinor)}${amount(r.overtimePayMinor)}${amount(r.netMinor)}</tr>`).join('');
    return `<h2>العملة ${escape(currency)}</h2><table class="list"><tr><th>الموظف</th><th>الحضور</th><th>غياب</th><th>إجازة</th><th>تأخير وخروج مبكر</th><th>تجاوز السماحية</th><th>إضافي</th><th>الراتب</th><th>${deductionMode === 'deduct' ? 'الخصومات' : 'خصم محتمل (تنبيه فقط)'}</th><th>بدل إضافي</th><th>الصافي التقديري</th></tr>${body}
<tr class="total"><th colspan="7">الإجمالي (${list.length} موظف)</th>${amount(sum('salaryMinor'))}${amount(deductionMode === 'deduct' ? sum('lateDeductionMinor') + sum('absenceDeductionMinor') : sum('potentialDeductionMinor'))}${amount(sum('overtimePayMinor'))}${amount(sum('netMinor'))}</tr></table>`;
  }).join('');
  const notes = rows.filter(r => r.warnings.length).map(r => `<li><b>${escape(r.employee.name)}:</b> ${r.warnings.map(escape).join('؛ ')}</li>`).join('');
  return page('كشف الرواتب ' + monthLabel, `<header><h1>كشف الرواتب التقديري</h1><p>${escape(monthLabel)} · ${deductionMode === 'deduct' ? 'الخصومات مطبقة حسب إعدادات الدوام' : 'وضع التنبيه: لا تُخصم أي مبالغ من الراتب'}</p></header>
${tables || '<p>لا يوجد موظفون نشطون.</p>'}${notes ? `<h2>تنبيهات</h2><ul>${notes}</ul>` : ''}
<p>تقدير محسوب من سجل البصمات والإجازات المعتمدة، ويُراجع قبل الصرف.</p><div class="signatures"><div>الموارد البشرية</div><div>المحاسب</div><div>الاعتماد</div></div>${footer(printedAt, printedBy)}`);
}

/** An attendance warning letter for one employee and month. */
export function warningLetterHtml(row: PayrollRow & { days: { date: string; kind: string; first: string | null; last: string | null; lateMinutes: number; earlyMinutes: number }[] }, monthLabel: string, labels: Record<string, string>, printedAt: string, printedBy: string): string {
  const issues = row.days.filter(d => d.kind === 'absent' || d.kind === 'missing' || d.lateMinutes > 0 || d.earlyMinutes > 0);
  const lines = issues.map(d => `<tr><td class="nowrap">${escape(dmy(d.date))}</td><td>${escape(labels[d.kind] || d.kind)}</td><td class="nowrap">${escape(d.first || '—')}</td><td class="nowrap">${escape(d.last || '—')}</td><td class="nowrap">${escape(hm(d.lateMinutes))}</td><td class="nowrap">${escape(hm(d.earlyMinutes))}</td></tr>`).join('');
  return page('إنذار حضور ' + row.employee.name, `<header><h1>إنذار بشأن الحضور والانصراف</h1><p>مواثيق للمحاماة · ${escape(monthLabel)}</p></header>
<table><tr><th>الموظف</th><td>${escape(row.employee.name)}</td></tr><tr><th>الرقم الوظيفي</th><td>${escape(row.employee.employeeNumber)}</td></tr></table>
<p>نود إحاطتكم بأن سجل الحضور للشهر المذكور أظهر ما يلي:</p><ul>${row.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul>
${lines ? `<h2>تفاصيل الأيام</h2><table class="list"><tr><th>التاريخ</th><th>الحالة</th><th>الدخول</th><th>الخروج</th><th>تأخير</th><th>خروج مبكر</th></tr>${lines}</table>` : ''}
<p>نأمل الالتزام بمواعيد الدوام الرسمية، وتقديم ما يبرر أي غياب أو تأخير إلى الموارد البشرية.</p>
<div class="signatures"><div>الموارد البشرية</div><div>توقيع الموظف بالعلم</div><div>التاريخ</div></div>${footer(printedAt, printedBy)}`);
}

/** Open a same-origin print window with already-escaped HTML. */
/**
 * Prints a standalone page through a hidden frame, so no extra window or tab is left open whether the person prints
 * or cancels. `window.__mawatheeqPrint`, when set (browser tests), receives the page instead of the print dialog.
 */
export function printHtml(html: string): boolean {
  const capture = (window as unknown as { __mawatheeqPrint?: (html: string) => void }).__mawatheeqPrint;
  if (typeof capture === 'function') { capture(html); return true; }
  document.querySelectorAll('iframe[data-print-frame]').forEach(f => f.remove());
  const frame = document.createElement('iframe');
  frame.setAttribute('data-print-frame', ''); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(frame);
  const win = frame.contentWindow, doc = frame.contentDocument;
  if (!win || !doc) { frame.remove(); return false; }
  doc.open(); doc.write(html); doc.close();
  let done = false;
  const cleanup = () => { if (done) return; done = true; setTimeout(() => frame.remove(), 500); };
  win.addEventListener('afterprint', cleanup);
  // Wait for the page's fonts so Arabic text prints correctly, then open the print dialog.
  const go = () => { win.focus(); win.print(); setTimeout(cleanup, 60000); };
  if (doc.fonts?.ready) void doc.fonts.ready.then(() => setTimeout(go, 50)); else setTimeout(go, 200);
  return true;
}

export type RollRow = { time: string; title: string; location: string; caseRef: string; parties: string; caseNumber: string; level: string; assignee: string; notes: string };
/** The day's hearings roll (رول الجلسات), grouped by court or expert office, in time order. */
export function hearingRollHtml(date: string, rows: RollRow[], printedAt: string, printedBy: string): string {
  const groups = new Map<string, RollRow[]>();
  for (const r of [...rows].sort((a, b) => (a.location + a.time).localeCompare(b.location + b.time))) groups.set(r.location || 'المكان غير محدد', [...(groups.get(r.location || 'المكان غير محدد') || []), r]);
  const body = [...groups].map(([place, list]) => `<h2>${escape(place)} (${list.length})</h2><table class="list"><tr><th>الوقت</th><th>القضية</th><th>الأطراف</th><th>رقم القضية</th><th>الدرجة</th><th>المحامي المسؤول</th><th>القرار السابق / ملاحظات</th><th>قرار الجلسة</th></tr>${list.map(r => `<tr><td class="nowrap">${escape(r.time || '—')}</td><td class="nowrap">${escape(r.caseRef)}</td><td>${escape(r.parties)}</td><td class="nowrap">${escape(r.caseNumber)}</td><td class="nowrap">${escape(r.level)}</td><td>${escape(r.assignee)}</td><td>${escape(r.notes)}</td><td style="width:18%"></td></tr>`).join('')}</table>`).join('');
  return page('رول الجلسات ' + dmy(date), `<header><h1>رول الجلسات</h1><p>${escape(dmy(date))} · ${rows.length} جلسة</p></header>${body || '<p>لا توجد جلسات في هذا اليوم.</p>'}${footer(printedAt, printedBy)}`);
}

/**
 * «رول الأحكام»: a numbered, grouped list in landscape. Cells are [main text, smaller second line]; the caller chooses
 * the columns. Smaller type is used when many columns are printed so the roll stays on the page width.
 */
export function judgmentRollHtml(title: string, scope: string, headers: string[], groups: [string, [string, string][][]][], printedAt: string, printedBy: string, widths: number[] = []): string {
  const total = groups.reduce((n, [, list]) => n + list.length, 0);
  let index = 0;
  const size = headers.length > 14 ? 9 : headers.length > 10 ? 10 : 11;
  const sum = widths.reduce((n, w) => n + w, 0);
  const cols = sum ? `<colgroup><col style="width:24px">${widths.map(w => `<col style="width:${(w / sum * 100).toFixed(2)}%">`).join('')}</colgroup>` : '';
  const table = (list: [string, string][][]) => `<table class="list roll">${cols}<thead><tr><th>م</th>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${list.map(row => `<tr><td class="nowrap">${++index}</td>${row.map(([main, sub]) => `<td>${escape(main)}${sub ? `<br><small>${escape(sub)}</small>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const body = groups.map(([label, list]) => `${label ? `<h2>${escape(label)} (${list.length})</h2>` : ''}${table(list)}`).join('');
  return page(title, `<style>.roll{font-size:${size}px;table-layout:fixed}.roll th{white-space:normal;line-height:1.3}.roll th:first-child,.roll td:first-child{text-align:center;padding-inline:2px}.roll td{overflow-wrap:break-word;word-break:normal;padding:4px 5px}.roll td small{font-size:.9em}.roll thead{display:table-header-group}.roll tr{break-inside:avoid}.roll small{color:#6b5a50}h2{break-after:avoid}</style><header><h1>${escape(title)}</h1><p>${escape(scope)} · ${total} قضية</p></header>${total ? body : '<p>لا توجد قضايا في هذا النطاق.</p>'}${footer(printedAt, printedBy)}`, true);
}

/** A simple printable table (file statements, a file's account statement…), escaped, with optional totals rows. */
export function listHtml(title: string, subtitle: string, headers: string[], rows: string[][], printedAt: string, printedBy: string, totals: [string, string][] = []): string {
  const table = `<table class="list"><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const sums = totals.length ? `<table class="totals" style="margin-top:12px;width:auto">${totals.map(([k, v]) => `<tr class="total"><th>${escape(k)}</th><td class="amount">${escape(v)}</td></tr>`).join('')}</table>` : '';
  return page(title, `<header><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></header>${rows.length ? table : '<p>لا توجد سجلات.</p>'}${sums}${footer(printedAt, printedBy)}`, headers.length > 6);
}

export type ArchiveLabel = { number: string; barcode: string; title: string; caseRef: string; parties: string; type: string; location: string };
/** Spine/cover labels for physical files, two per row, each with its archive number as a Code 39 barcode. */
export function archiveLabelsHtml(labels: ArchiveLabel[], printedAt: string, printedBy: string): string {
  const style = `<style>.labels{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.label{border:1.4px solid #6e1f33;border-radius:3mm;padding:3.5mm 4mm;break-inside:avoid;display:flex;flex-direction:column;gap:1.5mm;min-height:44mm}
.label-top{display:flex;justify-content:space-between;align-items:center;gap:3mm}.label-no{font-family:'Noto Kufi Arabic',sans-serif;font-size:18px;font-weight:700;color:#5a1a2b;direction:ltr}.label-type{font-size:10.5px;color:#7b6458;border:1px solid #d9c9b7;border-radius:99px;padding:0 7px}
.label-title{font-weight:700;font-size:13px;line-height:1.5}.label-meta{font-size:10.5px;color:#5c4a40}.label-bar{display:flex;justify-content:center;margin-top:auto}.label-bar svg{max-width:100%;height:13mm}.label-loc{font-size:10px;color:#8a7568;text-align:center}</style>`;
  const cards = labels.map(l => `<div class="label"><div class="label-top"><span class="label-no">${escape(l.number)}</span><span class="label-type">${escape(l.type)}</span></div><div class="label-title">${escape(l.title)}</div><div class="label-meta">${escape([l.caseRef, l.parties].filter(Boolean).join(' · '))}</div><div class="label-bar">${l.barcode}</div><div class="label-loc">${escape(l.location ? 'الموقع: ' + l.location : '')}</div></div>`).join('');
  return page('ملصقات ملفات الأرشيف', `${style}<header><h1>ملصقات ملفات الأرشيف</h1><p>${labels.length} ملصق</p></header><div class="labels">${cards}</div>${footer(printedAt, printedBy)}`);
}
/** A handover or receipt slip for one file movement, with signature lines for both sides. */
export function custodyReceiptHtml(title: string, rows: [string, string][], from: string, to: string, printedAt: string, printedBy: string): string {
  return page(title, `<header><h1>${escape(title)}</h1><p>يُحفظ أصل هذا الإيصال في الأرشيف وتُسلّم صورته للمستلم.</p></header><table>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`).join('')}</table>
<div class="signatures"><div>${escape(from)}<br>الاسم والتوقيع</div><div>${escape(to)}<br>الاسم والتوقيع</div></div>${footer(printedAt, printedBy)}`);
}

export type InvoicePrint = { title: string; number: string; date: string; due: string; partner: string; reference: string; caseLabel: string; status: string;
  lines: { label: string; quantity: string; price: string; discount: string; amount: string }[]; total: string; paid: string; due_amount: string; words: string;
  schedule: [string, string][]; note: string };
/** An invoice, bill or credit note: header, service lines, totals with what is paid and still due, instalments and a note. */
export function invoiceHtml(d: InvoicePrint, printedAt: string, printedBy: string): string {
  const info: [string, string][] = [['الرقم', d.number], ['التاريخ', dmy(d.date)], ['تاريخ الاستحقاق', dmy(d.due)], ['العميل / المورد', d.partner], ['المرجع', d.reference], ['القضية', d.caseLabel], ['الحالة', d.status]];
  const lines = `<table class="list"><thead><tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>المبلغ</th></tr></thead><tbody>${d.lines.map(l => `<tr><td>${escape(l.label)}</td><td class="amount">${escape(l.quantity)}</td><td class="amount">${escape(l.price)}</td><td class="amount">${escape(l.discount)}</td><td class="amount">${escape(l.amount)}</td></tr>`).join('')}</tbody></table>`;
  const totals: [string, string][] = [['الإجمالي (KWD)', d.total], ['المدفوع', d.paid], ['المتبقي', d.due_amount]];
  return page(d.title + ' ' + d.number, `<header><h1>${escape(d.title)}</h1><p>مواثيق للمحاماة</p></header>
<table>${info.filter(([, v]) => String(v || '').trim()).map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`).join('')}</table>${lines}
<table class="totals" style="margin-top:12px;width:auto">${totals.map(([k, v]) => `<tr class="total"><th>${escape(k)}</th><td class="amount">${escape(v)}</td></tr>`).join('')}</table>
${d.words ? `<p>${escape(d.words)}</p>` : ''}${d.schedule.length > 1 ? `<table class="list" style="margin-top:12px;width:auto"><thead><tr><th>الدفعة المستحقة في</th><th>المبلغ</th></tr></thead><tbody>${d.schedule.map(([a, b]) => `<tr><td>${escape(dmy(a))}</td><td class="amount">${escape(b)}</td></tr>`).join('')}</tbody></table>` : ''}
${d.note ? `<p>${escape(d.note)}</p>` : ''}<div class="signatures"><div>المحاسب</div><div>الختم</div></div>${footer(printedAt, printedBy)}`);
}
