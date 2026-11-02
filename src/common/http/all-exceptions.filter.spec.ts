import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { NotFoundError } from '../errors/app-error';
import { AllExceptionsFilter } from './all-exceptions.filter';

function setup() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ id: 'req-1' }) }),
  } as unknown as ArgumentsHost;
  const logger = { setContext: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
  return { filter: new AllExceptionsFilter(logger), host, status, json, logger };
}

describe('AllExceptionsFilter', () => {
  it('maps AppError to its status and code', () => {
    const { filter, host, status, json } = setup();
    filter.catch(new NotFoundError('nope'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: 'nope',
      requestId: 'req-1',
    });
  });

  it('maps HttpException keeping its status', () => {
    const { filter, host, status, json } = setup();
    filter.catch(new BadRequestException('bad input'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad input' }));
  });

  it('hides internals of unknown errors and logs them', () => {
    const { filter, host, status, json, logger } = setup();
    filter.catch(new Error('db password is hunter2'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error' }),
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
